from __future__ import annotations

import argparse
import time
from pathlib import Path
from urllib.request import urlretrieve

import cv2
import mediapipe as mp
import pyautogui


def clamp(value: float, low: float, high: float) -> float:
	return max(low, min(high, value))


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description="Control mouse with head movement and click by opening mouth"
	)
	parser.add_argument(
		"--model-path",
		type=Path,
		default=None,
		help="Path to MediaPipe face_landmarker.task model (auto-downloaded if missing)",
	)
	parser.add_argument(
		"--camera-index",
		type=int,
		default=0,
		help="Webcam index passed to OpenCV VideoCapture",
	)
	parser.add_argument(
		"--sensitivity",
		type=float,
		default=1.5,
		help="Absolute movement scale from head offset",
	)
	parser.add_argument(
		"--smoothing",
		type=float,
		default=0.35,
		help="Exponential smoothing factor for head position (0-1)",
	)
	parser.add_argument(
		"--mouth-open-threshold",
		type=float,
		default=0.28,
		help="Mouth-open ratio threshold for click detection",
	)
	parser.add_argument(
		"--click-cooldown",
		type=float,
		default=0.8,
		help="Minimum seconds between clicks",
	)
	parser.add_argument(
		"--edge-snap-px",
		type=int,
		default=60,
		help="Snap to exact edges when cursor is within this many pixels",
	)
	parser.add_argument(
		"--failsafe-inset-px",
		type=int,
		default=4,
		help="Keep cursor this many pixels away from true screen corners when fail-safe is on",
	)
	return parser.parse_args()


def ensure_face_landmarker_model(model_path: Path | None) -> Path:
	if model_path is None:
		model_path = Path(__file__).parent / "models" / "face_landmarker.task"

	if model_path.exists():
		return model_path

	model_path.parent.mkdir(parents=True, exist_ok=True)
	model_url = (
		"https://storage.googleapis.com/mediapipe-models/"
		"face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
	)
	print(f"Downloading MediaPipe face model to {model_path}...")
	urlretrieve(model_url, model_path)
	return model_path


def main() -> None:
	args = parse_args()

	pyautogui.FAILSAFE = True
	pyautogui.PAUSE = 0
	screen_w, screen_h = pyautogui.size()
	edge_snap_px = max(0, args.edge_snap_px)
	failsafe_inset_px = max(1, args.failsafe_inset_px) if pyautogui.FAILSAFE else 0

	def clamp_to_screen(x: float, y: float) -> tuple[int, int]:
		max_x = max(0, screen_w - 1)
		max_y = max(0, screen_h - 1)
		min_x = min(failsafe_inset_px, max_x)
		min_y = min(failsafe_inset_px, max_y)
		safe_max_x = max(min_x, max_x - failsafe_inset_px)
		safe_max_y = max(min_y, max_y - failsafe_inset_px)

		x = clamp(x, min_x, safe_max_x)
		y = clamp(y, min_y, safe_max_y)

		if x <= min_x + edge_snap_px:
			x = min_x
		elif x >= safe_max_x - edge_snap_px:
			x = safe_max_x

		if y <= min_y + edge_snap_px:
			y = min_y
		elif y >= safe_max_y - edge_snap_px:
			y = safe_max_y

		return int(x), int(y)

	cap = cv2.VideoCapture(args.camera_index)
	if not cap.isOpened():
		raise RuntimeError("Unable to open webcam")

	face_mesh = None
	face_landmarker = None
	use_tasks_api = not hasattr(mp, "solutions")

	if use_tasks_api:
		from mediapipe.tasks.python import BaseOptions
		from mediapipe.tasks.python import vision

		model_path = ensure_face_landmarker_model(args.model_path)
		options = vision.FaceLandmarkerOptions(
			base_options=BaseOptions(model_asset_path=str(model_path)),
			running_mode=vision.RunningMode.VIDEO,
			num_faces=1,
			min_face_detection_confidence=0.5,
			min_face_presence_confidence=0.5,
			min_tracking_confidence=0.5,
		)
		face_landmarker = vision.FaceLandmarker.create_from_options(options)
	else:
		mp_face_mesh = mp.solutions.face_mesh
		face_mesh = mp_face_mesh.FaceMesh(
			max_num_faces=1,
			refine_landmarks=True,
			min_detection_confidence=0.5,
			min_tracking_confidence=0.5,
		)

	# Nose tip landmark for stable head translation estimation.
	nose_idx = 1
	smoothed_x = None
	smoothed_y = None

	baseline_x = None
	baseline_y = None
	anchor_x = None
	anchor_y = None

	mouth_open_prev = False
	last_click_time = 0.0
	click_flash_until = 0.0

	print("Head-mouse control started")
	print("Move head to move cursor (absolute mapping); open mouth to left click")
	print("Press 'r' to re-center, 'q' to quit")
	if pyautogui.FAILSAFE:
		print(f"Fail-safe is enabled. Keeping cursor at least {failsafe_inset_px}px away from corners.")

	try:
		while True:
			ok, frame = cap.read()
			if not ok:
				continue

			frame = cv2.flip(frame, 1)
			rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
			nose = None
			upper_lip = None
			lower_lip = None
			left_eye_outer = None
			right_eye_outer = None

			if use_tasks_api:
				mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
				timestamp_ms = int(time.time() * 1000)
				result = face_landmarker.detect_for_video(mp_image, timestamp_ms)
				if result.face_landmarks:
					landmarks = result.face_landmarks[0]
					nose = landmarks[nose_idx]
					upper_lip = landmarks[13]
					lower_lip = landmarks[14]
					left_eye_outer = landmarks[33]
					right_eye_outer = landmarks[263]
			else:
				result = face_mesh.process(rgb)
				if result.multi_face_landmarks:
					landmarks = result.multi_face_landmarks[0].landmark
					nose = landmarks[nose_idx]
					upper_lip = landmarks[13]
					lower_lip = landmarks[14]
					left_eye_outer = landmarks[33]
					right_eye_outer = landmarks[263]

			if nose is not None:
				now = time.time()

				if smoothed_x is None:
					smoothed_x = nose.x
					smoothed_y = nose.y
					baseline_x = nose.x
					baseline_y = nose.y
					anchor_x, anchor_y = clamp_to_screen(*pyautogui.position())
				else:
					smooth = clamp(args.smoothing, 0.01, 1.0)
					smoothed_x = (1 - smooth) * smoothed_x + smooth * nose.x
					smoothed_y = (1 - smooth) * smoothed_y + smooth * nose.y

				if baseline_x is not None and baseline_y is not None and anchor_x is not None and anchor_y is not None:
					offset_x = (smoothed_x - baseline_x) * args.sensitivity
					offset_y = (smoothed_y - baseline_y) * args.sensitivity
					target_x, target_y = clamp_to_screen(
						anchor_x + offset_x * screen_w,
						anchor_y + offset_y * screen_h,
					)
					try:
						pyautogui.moveTo(target_x, target_y)
					except pyautogui.FailSafeException:
						# Recover by moving to a safe in-bounds point next frame.
						continue

					# Enforce bounds after movement as a final safety step.
					actual_x, actual_y = pyautogui.position()
					fixed_x, fixed_y = clamp_to_screen(actual_x, actual_y)
					if (actual_x, actual_y) != (fixed_x, fixed_y):
						try:
							pyautogui.moveTo(fixed_x, fixed_y)
						except pyautogui.FailSafeException:
							continue

				mouth_open = False
				if (
					upper_lip is not None
					and lower_lip is not None
					and left_eye_outer is not None
					and right_eye_outer is not None
				):
					mouth_gap = abs(lower_lip.y - upper_lip.y)
					eye_width = abs(right_eye_outer.x - left_eye_outer.x)
					if eye_width > 1e-6:
						mouth_ratio = mouth_gap / eye_width
						mouth_open = mouth_ratio > args.mouth_open_threshold

				if mouth_open and (not mouth_open_prev) and now - last_click_time > args.click_cooldown:
					try:
						pyautogui.click()
					except pyautogui.FailSafeException:
						continue
					last_click_time = now
					click_flash_until = now + 0.2

				if now < click_flash_until:
					cv2.putText(
						frame,
						"CLICK",
						(20, 40),
						cv2.FONT_HERSHEY_SIMPLEX,
						1.0,
						(0, 255, 0),
						2,
					)

				mouth_open_prev = mouth_open

				h, w = frame.shape[:2]
				nose_px = int(nose.x * w)
				nose_py = int(nose.y * h)
				pointer_color = (0, 255, 0) if now < click_flash_until else (0, 255, 255)
				cv2.circle(frame, (nose_px, nose_py), 6, pointer_color, -1)

			cv2.putText(
				frame,
				"q: quit | r: re-center",
				(20, 30),
				cv2.FONT_HERSHEY_SIMPLEX,
				0.7,
				(255, 255, 255),
				2,
			)
			cv2.imshow("Head Mouse Controller", frame)

			key = cv2.waitKey(1) & 0xFF
			if key == ord("q"):
				break
			if key == ord("r") and smoothed_x is not None and smoothed_y is not None:
				baseline_x = smoothed_x
				baseline_y = smoothed_y
				anchor_x, anchor_y = clamp_to_screen(*pyautogui.position())
				mouth_open_prev = False

	finally:
		cap.release()
		if face_mesh is not None:
			face_mesh.close()
		if face_landmarker is not None:
			face_landmarker.close()
		cv2.destroyAllWindows()


if __name__ == "__main__":
	main()
