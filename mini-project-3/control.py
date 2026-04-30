#!/usr/bin/env python3
"""Play `raw.mp4` alongside a simulated robot-arm cube.

The robot arm sketch in hw3/robot_arm.pde sends plain-text commands over
serial:

* `move x y z`
* `rotate theta`

This script replays a CSV log of those commands while the video plays. The
goal is to make it easy to compare the raw recording with a lightweight
simulation while developing the command pipeline.

CSV schema
----------

Required columns:

* `timestamp_s` - seconds from the start of `raw.mp4`
* `action` - one of `move`, `rotate`, or `wait`

Move rows:

* `x`, `y`, `z` - target end-effector position in the same coordinate system
  used by the sketch
* `duration_s` - optional animation duration in seconds; defaults to `0`

Rotate rows:

* `theta_deg` - claw rotation angle in degrees
* `duration_s` - optional animation duration in seconds; defaults to `0`

Wait rows:

* `duration_s` - how long to hold the current pose

Example:

timestamp_s,action,x,y,z,theta_deg,duration_s
0.00,move,0,100,50,,0.00
0.25,move,20,100,60,,0.25
0.60,rotate,,,,35,0.15
"""

from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import subprocess
import time

import imageio.v2 as imageio
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.animation import FuncAnimation
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.patches import Rectangle
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from serial.tools import list_ports
import serial


INITIAL_POSITION = np.array([0.0, 100.0, 50.0], dtype=float)
INITIAL_THETA_DEG = 0.0
CUBE_SIZE = 45.0
TRAIL_COLOR = "#1f77b4"
EXPORT_FPS = 15.0
SIM_CENTER = np.array([0.0, 100.0, 50.0], dtype=float)
SIM_HALF_RANGE = 100.0
FFPLAY_PATH = "ffplay"
DEFAULT_RENDER_OUTPUT = Path(__file__).with_name("sim.mp4")
DEFAULT_BAUDRATE = 9600
MOVE_STROKE_SPEED = 12.0
MIN_MOVE_DELAY_MS = 80
MAX_MOVE_DELAY_MS = 450


@dataclass(frozen=True)
class CommandRow:
	timestamp_s: float
	action: str
	x: float | None = None
	y: float | None = None
	z: float | None = None
	theta_deg: float | None = None
	duration_s: float = 0.0
	label: str = ""


@dataclass
class PoseState:
	position: np.ndarray
	theta_deg: float


def parse_float(value: str | None, *, default: float | None = None) -> float | None:
	if value is None:
		return default
	text = value.strip()
	if not text:
		return default
	return float(text)


def first_present(row: dict[str, str], *keys: str) -> str | None:
	for key in keys:
		value = row.get(key)
		if value is not None and value.strip() != "":
			return value
	return None


def load_commands(path: Path) -> list[CommandRow]:
	if not path.exists():
		raise FileNotFoundError(
			f"Missing command log: {path}\n\n"
			"Expected CSV schema: timestamp_s, action, x, y, z, theta_deg, duration_s"
		)

	commands: list[CommandRow] = []
	with path.open(newline="", encoding="utf-8") as handle:
		reader = csv.DictReader(handle)
		for line_no, row in enumerate(reader, start=2):
			timestamp_s = parse_float(first_present(row, "timestamp_s", "time_s", "t"))
			if timestamp_s is None:
				raise ValueError(f"{path}:{line_no}: missing timestamp_s")

			action_raw = first_present(row, "action", "command", "type")
			if action_raw is None:
				raise ValueError(f"{path}:{line_no}: missing action")
			action = action_raw.strip().lower()

			command = CommandRow(
				timestamp_s=timestamp_s,
				action=action,
				x=parse_float(first_present(row, "x")),
				y=parse_float(first_present(row, "y")),
				z=parse_float(first_present(row, "z")),
				theta_deg=parse_float(first_present(row, "theta_deg", "theta")),
				duration_s=parse_float(first_present(row, "duration_s", "dwell_s", "duration"), default=0.0) or 0.0,
				label=(first_present(row, "label", "note") or "").strip(),
			)
			commands.append(command)

	commands.sort(key=lambda command: command.timestamp_s)
	return commands


def load_video_frames(path: Path) -> tuple[list[np.ndarray], float]:
	if not path.exists():
		raise FileNotFoundError(f"Missing video: {path}")

	reader = imageio.get_reader(str(path))
	try:
		meta = reader.get_meta_data()
		fps = float(meta.get("fps", 30.0) or 30.0)
		frames = [np.asarray(frame) for frame in reader]
	finally:
		reader.close()

	return frames, fps


def lerp(start: np.ndarray, end: np.ndarray, fraction: float) -> np.ndarray:
	return start + (end - start) * fraction


def clamp_fraction(elapsed: float, duration: float) -> float:
	if duration <= 0.0:
		return 1.0
	return float(np.clip(elapsed / duration, 0.0, 1.0))


def move_duration_seconds(start: np.ndarray, end: np.ndarray) -> float:
	distance = float(np.linalg.norm(end - start))
	ms = int((distance / max(0.1, MOVE_STROKE_SPEED)) * 1000.0)
	ms = int(np.clip(ms, MIN_MOVE_DELAY_MS, MAX_MOVE_DELAY_MS))
	return ms / 1000.0


def pose_at_time(commands: list[CommandRow], timestamp_s: float) -> PoseState:
	position = INITIAL_POSITION.copy()
	theta_deg = INITIAL_THETA_DEG

	for command in commands:
		start_time = command.timestamp_s

		if timestamp_s < start_time:
			break

		if command.action == "move":
			if command.x is None or command.y is None or command.z is None:
				continue
			target = np.array([command.x, command.y, command.z], dtype=float)
			end_time = start_time + move_duration_seconds(position, target)
			if timestamp_s < end_time:
				fraction = clamp_fraction(timestamp_s - start_time, end_time - start_time)
				return PoseState(position=lerp(position, target, fraction), theta_deg=theta_deg)
			position = target

		elif command.action == "rotate":
			if command.theta_deg is None:
				continue
			target_theta = float(command.theta_deg)
			end_time = start_time + max(0.0, command.duration_s)
			if timestamp_s < end_time:
				fraction = clamp_fraction(timestamp_s - start_time, command.duration_s)
				theta_deg = float(theta_deg + (target_theta - theta_deg) * fraction)
				return PoseState(position=position.copy(), theta_deg=theta_deg)
			theta_deg = target_theta

		elif command.action == "wait":
			if timestamp_s < end_time:
				return PoseState(position=position.copy(), theta_deg=theta_deg)

	return PoseState(position=position.copy(), theta_deg=theta_deg)


def trail_positions(commands: list[CommandRow], timestamp_s: float) -> np.ndarray:
	points = [INITIAL_POSITION.copy()]
	position = INITIAL_POSITION.copy()
	theta_deg = INITIAL_THETA_DEG

	for command in commands:
		start_time = command.timestamp_s

		if timestamp_s < start_time:
			break

		if command.action == "move":
			if command.x is None or command.y is None or command.z is None:
				continue
			target = np.array([command.x, command.y, command.z], dtype=float)
			end_time = start_time + move_duration_seconds(position, target)
			if timestamp_s < end_time:
				fraction = clamp_fraction(timestamp_s - start_time, end_time - start_time)
				points.append(lerp(position, target, fraction))
				break
			position = target
			points.append(position.copy())

		elif command.action == "rotate":
			if command.theta_deg is None:
				continue
			end_time = start_time + max(0.0, command.duration_s)
			if timestamp_s < end_time:
				break
			theta_deg = float(command.theta_deg)

		elif command.action == "wait":
			if timestamp_s < end_time:
				break

	_ = theta_deg
	return np.vstack(points)


def cube_geometry(center: np.ndarray, size: float, theta_deg: float) -> tuple[list[list[tuple[float, float, float]]], list[str]]:
	half = size / 2.0
	vertices = np.array(
		[
			[-half, -half, -half],
			[half, -half, -half],
			[half, half, -half],
			[-half, half, -half],
			[-half, -half, half],
			[half, -half, half],
			[half, half, half],
			[-half, half, half],
		],
		dtype=float,
	)

	theta = np.deg2rad(theta_deg)
	rotation = np.array(
		[
			[1.0, 0.0, 0.0],
			[0.0, np.cos(theta), -np.sin(theta)],
			[0.0, np.sin(theta), np.cos(theta)],
		],
		dtype=float,
	)
	rotated = vertices @ rotation.T + center

	faces = [
		[rotated[i] for i in [0, 1, 2, 3]],
		[rotated[i] for i in [4, 5, 6, 7]],
		[rotated[i] for i in [0, 1, 5, 4]],
		[rotated[i] for i in [2, 3, 7, 6]],
		[rotated[i] for i in [1, 2, 6, 5]],
		[rotated[i] for i in [4, 7, 3, 0]],
	]

	colors = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#f78c6b", "#8e7dbe"]
	return faces, colors


def set_axes_equal(ax: plt.Axes) -> None:
	x_limits = ax.get_xlim3d()
	y_limits = ax.get_ylim3d()
	z_limits = ax.get_zlim3d()

	x_range = abs(x_limits[1] - x_limits[0])
	y_range = abs(y_limits[1] - y_limits[0])
	z_range = abs(z_limits[1] - z_limits[0])
	max_range = max(x_range, y_range, z_range)

	x_middle = np.mean(x_limits)
	y_middle = np.mean(y_limits)
	z_middle = np.mean(z_limits)

	half = max_range / 2.0
	ax.set_xlim3d(x_middle - half, x_middle + half)
	ax.set_ylim3d(y_middle - half, y_middle + half)
	ax.set_zlim3d(z_middle - half, z_middle + half)


def compute_bounds(commands: list[CommandRow], video_frames: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
	xs = [INITIAL_POSITION[0]]
	ys = [INITIAL_POSITION[1]]
	zs = [INITIAL_POSITION[2]]

	for command in commands:
		if command.action == "move" and None not in (command.x, command.y, command.z):
			xs.append(float(command.x))
			ys.append(float(command.y))
			zs.append(float(command.z))

	if video_frames:
		height, width = video_frames[0].shape[:2]
		xs.extend([0.0, float(width)])
		ys.extend([0.0, float(height)])

	lower = np.array([min(xs), min(ys), min(zs)], dtype=float)
	upper = np.array([max(xs), max(ys), max(zs)], dtype=float)
	return lower, upper


def set_simulation_bounds(ax: plt.Axes) -> None:
	ax.set_xlim(SIM_CENTER[0] - SIM_HALF_RANGE, SIM_CENTER[0] + SIM_HALF_RANGE)
	ax.set_ylim(SIM_CENTER[1] - SIM_HALF_RANGE, SIM_CENTER[1] + SIM_HALF_RANGE)
	ax.set_zlim(SIM_CENTER[2] - SIM_HALF_RANGE, SIM_CENTER[2] + SIM_HALF_RANGE)
	ax.set_box_aspect((1, 1, 1))


def start_audio_playback(video_path: Path) -> subprocess.Popen[bytes] | None:
	try:
		return subprocess.Popen(
			[FFPLAY_PATH, "-nodisp", "-autoexit", "-loglevel", "quiet", str(video_path)],
			stdin=subprocess.DEVNULL,
			stdout=subprocess.DEVNULL,
			stderr=subprocess.DEVNULL,
		)
	except FileNotFoundError:
		print("Warning: ffplay was not found, realtime playback will be silent.")
		return None


def find_serial_port(preferred_port: str | None = None) -> str | None:
	if preferred_port:
		return preferred_port

	ports = list(list_ports.comports())
	if not ports:
		return None

	priority_keywords = ("usbmodem", "usbserial", "acm", "tty.usb")
	for port in ports:
		device = port.device
		if any(keyword in device.lower() for keyword in priority_keywords):
			return device

	return ports[0].device


def open_serial_port(port_name: str | None, baudrate: int) -> serial.Serial | None:
	resolved_port = find_serial_port(port_name)
	if resolved_port is None:
		print("Warning: no serial port found, commands will not be sent.")
		return None

	print(f"Using serial port: {resolved_port} @ {baudrate}")
	return serial.Serial(resolved_port, baudrate=baudrate, timeout=0)


def send_command(serial_port: serial.Serial | None, command: CommandRow) -> None:
	if serial_port is None:
		return

	if command.action == "move" and None not in (command.x, command.y, command.z):
		message = f"move {command.x} {command.y} {command.z}\n"
	elif command.action == "rotate" and command.theta_deg is not None:
		message = f"rotate {int(round(command.theta_deg))}\n"
	else:
		return

	serial_port.write(message.encode("utf-8"))
	serial_port.flush()


def play_realtime(video_path: Path, commands_path: Path, port_name: str | None, baudrate: int) -> None:
	commands = load_commands(commands_path)
	frames, fps = load_video_frames(video_path)

	if not frames:
		raise ValueError(f"No frames found in {video_path}")

	video_duration_s = len(frames) / fps

	serial_port = open_serial_port(port_name, baudrate)
	fig = plt.figure(figsize=(10, 6))
	video_ax = fig.add_subplot(1, 1, 1)

	video_ax.set_title(video_path.name)
	video_ax.axis("off")
	video_image = video_ax.imshow(frames[0])
	status_text = video_ax.text(
		0.02,
		0.96,
		"",
		transform=video_ax.transAxes,
		color="white",
		fontsize=11,
		ha="left",
		va="top",
		bbox=dict(facecolor="black", alpha=0.5, edgecolor="none"),
	)
	serial_status = "serial: connected" if serial_port is not None else "serial: unavailable"
	audio_status = "audio: on"
	command_index = 0
	start_time: float | None = None
	try:
		plt.tight_layout()
		plt.show(block=False)
		audio_process = start_audio_playback(video_path)
		start_time = time.perf_counter()
		while plt.fignum_exists(fig.number):
			elapsed = time.perf_counter() - start_time
			if elapsed >= video_duration_s:
				break

			frame_index = min(int(elapsed * fps), len(frames) - 1)
			video_image.set_data(frames[frame_index])
			status_text.set_text(f"t = {elapsed:0.2f}s | {serial_status} | {audio_status}")

			while command_index < len(commands) and commands[command_index].timestamp_s <= elapsed:
				send_command(serial_port, commands[command_index])
				command_index += 1

			fig.canvas.draw_idle()
			plt.pause(0.001)
	finally:
		if serial_port is not None:
			serial_port.close()
		if 'audio_process' in locals() and audio_process is not None and audio_process.poll() is None:
			audio_process.terminate()
			try:
				audio_process.wait(timeout=2)
			except subprocess.TimeoutExpired:
				audio_process.kill()


def render_to_file(video_path: Path, commands_path: Path, output_path: Path) -> None:
	commands = load_commands(commands_path)
	frames, fps = load_video_frames(video_path)

	if not frames:
		raise ValueError(f"No frames found in {video_path}")

	video_duration_s = len(frames) / fps
	command_duration_s = 0.0
	for command in commands:
		command_duration_s = max(command_duration_s, command.timestamp_s + max(0.0, command.duration_s))
	total_duration_s = max(video_duration_s, command_duration_s)
	output_fps = min(fps, EXPORT_FPS)
	total_frames = max(1, int(np.ceil(total_duration_s * output_fps)))

	fig = plt.figure(figsize=(12, 6), dpi=80)
	FigureCanvasAgg(fig)
	video_ax = fig.add_subplot(1, 2, 1)
	sim_ax = fig.add_subplot(1, 2, 2, projection="3d")

	video_ax.set_title(video_path.name)
	video_ax.axis("off")
	video_image = video_ax.imshow(frames[0])

	sim_ax.set_title("Robot arm simulation")
	sim_ax.set_xlabel("x")
	sim_ax.set_ylabel("y")
	sim_ax.set_zlabel("z")
	sim_ax.view_init(elev=22, azim=-55)

	set_simulation_bounds(sim_ax)

	trail_line, = sim_ax.plot([], [], [], color=TRAIL_COLOR, linewidth=2.0, alpha=0.65)
	time_text = sim_ax.text2D(0.02, 0.96, "", transform=sim_ax.transAxes)
	command_text = sim_ax.text2D(0.02, 0.90, "", transform=sim_ax.transAxes)

	cube_collection = Poly3DCollection([], facecolors=[], edgecolors="#1f1f1f", linewidths=1.0, alpha=0.95)
	sim_ax.add_collection3d(cube_collection)

	output_path.parent.mkdir(parents=True, exist_ok=True)
	with imageio.get_writer(str(output_path), fps=output_fps, codec="libx264", quality=8) as writer:
		for frame_index in range(total_frames):
			timestamp_s = frame_index / output_fps
			video_index = min(int(round(timestamp_s * fps)), len(frames) - 1)
			video_frame = frames[video_index]
			video_image.set_data(video_frame)

			pose = pose_at_time(commands, timestamp_s)
			faces, colors = cube_geometry(pose.position, CUBE_SIZE, pose.theta_deg)
			cube_collection.set_verts(faces)
			cube_collection.set_facecolor(colors)

			trail = trail_positions(commands, timestamp_s)
			trail_line.set_data(trail[:, 0], trail[:, 1])
			trail_line.set_3d_properties(trail[:, 2])

			time_text.set_text(f"t = {timestamp_s:0.2f}s")
			active = next((cmd for cmd in reversed(commands) if cmd.timestamp_s <= timestamp_s), None)
			if active is None:
				command_text.set_text("idle")
			else:
				if active.action == "move":
					command_text.set_text(
						f"{active.action} -> ({active.x:.1f}, {active.y:.1f}, {active.z:.1f})"
						if None not in (active.x, active.y, active.z)
						else active.action
					)
				elif active.action == "rotate":
					command_text.set_text(f"{active.action} -> {active.theta_deg:.1f} deg" if active.theta_deg is not None else active.action)
				else:
					command_text.set_text(active.action)

			fig.canvas.draw()
			rgba = np.asarray(fig.canvas.buffer_rgba())
			writer.append_data(np.asarray(rgba[:, :, :3]))

	plt.close(fig)


def build_arg_parser() -> argparse.ArgumentParser:
	parser = argparse.ArgumentParser(description="Play raw.mp4 with a synchronized robot-arm cube simulation.")
	parser.add_argument("--render", action="store_true", help="Render the simulation to an MP4 file instead of playing in realtime.")
	parser.add_argument("--video", type=Path, default=Path(__file__).with_name("raw.mp4"), help="Path to the MP4 file.")
	parser.add_argument(
		"--commands",
		type=Path,
		default=Path(__file__).with_name("command.csv"),
		help="CSV file containing timestamped robot commands.",
	)
	parser.add_argument(
		"--output",
		type=Path,
		default=DEFAULT_RENDER_OUTPUT,
		help="Output MP4 path used with --render.",
	)
	parser.add_argument(
		"--port",
		type=str,
		default=None,
		help="Serial port device to use when playing in realtime. Defaults to auto-detect.",
	)
	parser.add_argument(
		"--baudrate",
		type=int,
		default=DEFAULT_BAUDRATE,
		help="Serial baud rate used in realtime mode.",
	)
	return parser


def main(argv: Iterable[str] | None = None) -> int:
	parser = build_arg_parser()
	args = parser.parse_args(list(argv) if argv is not None else None)
	if args.render:
		render_to_file(args.video, args.commands, args.output)
		return 0
	play_realtime(args.video, args.commands, args.port, args.baudrate)
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
