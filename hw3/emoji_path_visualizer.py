#!/usr/bin/env python3
"""Visualize robot emoji drawing paths with Matplotlib.

This script mirrors the geometry in hw3/robot_arm.pde so the plotted paths
match what the robot arm is commanded to draw.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from typing import Callable

import matplotlib.pyplot as plt
import numpy as np

CENTER_Y = 100.0
EMOJI_SCALE = 0.7


@dataclass
class PathPoint:
    x: float
    y: float
    hovering: bool


@dataclass
class PathBuilder:
    """Collects 2D points in the order the robot is commanded to move."""

    points: list[PathPoint] = field(default_factory=list)

    def move(self, x: float, y: float, hovering: bool = False) -> None:
        self.points.append(PathPoint(x=x, y=y, hovering=hovering))

    def hover_move(self, x: float, y: float) -> None:
        self.move(x, y, hovering=True)

    def draw_circle(self, cx: float, cy: float, radius: float, segments: int) -> None:
        start_x = cx + radius
        start_y = cy
        self.hover_move(start_x, start_y)

        for i in range(segments + 1):
            t = 2.0 * np.pi * i / segments
            x = cx + np.cos(t) * radius
            y = cy + np.sin(t) * radius
            self.move(x, y, hovering=False)

        self.hover_move(start_x, start_y)

    def draw_arc(
        self,
        cx: float,
        cy: float,
        radius: float,
        start_angle: float,
        end_angle: float,
        segments: int,
    ) -> None:
        start_x = cx + np.cos(start_angle) * radius
        start_y = cy + np.sin(start_angle) * radius
        end_x = cx + np.cos(end_angle) * radius
        end_y = cy + np.sin(end_angle) * radius
        self.hover_move(start_x, start_y)

        for i in range(segments + 1):
            t = start_angle + (end_angle - start_angle) * (i / segments)
            x = cx + np.cos(t) * radius
            y = cy + np.sin(t) * radius
            self.move(x, y, hovering=False)

        self.hover_move(end_x, end_y)

    def draw_line(
        self,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        segments: int,
    ) -> None:
        self.hover_move(x1, y1)

        for i in range(segments + 1):
            t = i / segments
            x = x1 + (x2 - x1) * t
            y = y1 + (y2 - y1) * t
            self.move(x, y, hovering=False)

        self.hover_move(x2, y2)


def sx(x: float, scale: float) -> float:
    return x * scale


def sy(y: float, scale: float) -> float:
    return CENTER_Y + (y - CENTER_Y) * scale


def sr(radius: float, scale: float) -> float:
    return radius * scale


def draw_face_outline(pb: PathBuilder, scale: float) -> None:
    pb.hover_move(0.0, CENTER_Y)
    pb.draw_circle(sx(0.0, scale), sy(100.0, scale), sr(35.0, scale), 24)


def robot_draw_smile(pb: PathBuilder, scale: float) -> None:
    draw_face_outline(pb, scale)
    pb.draw_circle(sx(-12.0, scale), sy(112.0, scale), sr(8.0, scale), 12)
    pb.draw_circle(sx(12.0, scale), sy(112.0, scale), sr(8.0, scale), 12)
    pb.draw_arc(sx(0.0, scale), sy(92.0, scale), sr(15.0, scale), 0.2, np.pi - 0.2, 14)


def robot_draw_wink(pb: PathBuilder, scale: float) -> None:
    draw_face_outline(pb, scale)
    pb.draw_circle(sx(-12.0, scale), sy(112.0, scale), sr(8.0, scale), 12)
    pb.draw_line(sx(4.0, scale), sy(112.0, scale), sx(20.0, scale), sy(112.0, scale), 6)
    pb.draw_arc(sx(0.0, scale), sy(92.0, scale), sr(13.0, scale), 0.4, np.pi - 0.4, 10)


def robot_draw_surprised(pb: PathBuilder, scale: float) -> None:
    draw_face_outline(pb, scale)
    pb.draw_circle(sx(-12.0, scale), sy(112.0, scale), sr(8.0, scale), 12)
    pb.draw_circle(sx(12.0, scale), sy(112.0, scale), sr(8.0, scale), 12)
    pb.draw_circle(sx(0.0, scale), sy(92.0, scale), sr(7.0, scale), 14)


def robot_draw_sad(pb: PathBuilder, scale: float) -> None:
    draw_face_outline(pb, scale)
    pb.draw_circle(sx(-12.0, scale), sy(112.0, scale), sr(8.0, scale), 12)
    pb.draw_circle(sx(12.0, scale), sy(112.0, scale), sr(8.0, scale), 12)
    pb.draw_arc(
        sx(0.0, scale),
        sy(84.0, scale),
        sr(14.0, scale),
        np.pi + 0.35,
        2.0 * np.pi - 0.35,
        12,
    )


def robot_draw_embarrassed(pb: PathBuilder, scale: float) -> None:
    draw_face_outline(pb, scale)

    pb.draw_line(sx(-29.0, scale), sy(124.0, scale), sx(-9.0, scale), sy(112.0, scale), 10)
    pb.draw_line(sx(-29.0, scale), sy(100.0, scale), sx(-9.0, scale), sy(112.0, scale), 10)

    pb.draw_line(sx(29.0, scale), sy(124.0, scale), sx(9.0, scale), sy(112.0, scale), 10)
    pb.draw_line(sx(29.0, scale), sy(100.0, scale), sx(9.0, scale), sy(112.0, scale), 10)

    pb.draw_line(sx(-22.0, scale), sy(100.0, scale), sx(-17.0, scale), sy(98.0, scale), 4)
    pb.draw_line(sx(-22.0, scale), sy(96.0, scale), sx(-17.0, scale), sy(94.0, scale), 4)
    pb.draw_line(sx(22.0, scale), sy(100.0, scale), sx(17.0, scale), sy(98.0, scale), 4)
    pb.draw_line(sx(22.0, scale), sy(96.0, scale), sx(17.0, scale), sy(94.0, scale), 4)

    pb.draw_arc(sx(0.0, scale), sy(92.0, scale), sr(8.0, scale), 0.45, np.pi - 0.45, 10)


EMOJI_DRAWERS: dict[str, Callable[[PathBuilder, float], None]] = {
    "Smile": robot_draw_smile,
    "Wink": robot_draw_wink,
    "Surprised": robot_draw_surprised,
    "Sad": robot_draw_sad,
    "Embarrassed": robot_draw_embarrassed,
}


def build_path(draw_fn: Callable[[PathBuilder, float], None], scale: float) -> list[PathPoint]:
    pb = PathBuilder()
    draw_fn(pb, scale)
    return pb.points


def plot_emoji_paths(scale: float, output: str | None = None) -> None:
    fig, axes = plt.subplots(2, 3, figsize=(14, 8))
    axes = axes.ravel()

    for idx, (name, drawer) in enumerate(EMOJI_DRAWERS.items()):
        pts = build_path(drawer, scale)
        ax = axes[idx]

        for i in range(1, len(pts)):
            p0 = pts[i - 1]
            p1 = pts[i]
            is_hover_segment = p0.hovering or p1.hovering
            if is_hover_segment:
                ax.plot(
                    [p0.x, p1.x],
                    [p0.y, p1.y],
                    "-",
                    lw=1.2,
                    color="#1f77b4",
                    alpha=0.22,
                )
            else:
                ax.plot([p0.x, p1.x], [p0.y, p1.y], "-", lw=1.4, color="#1f77b4", alpha=1.0)

        draw_x = [p.x for p in pts if not p.hovering]
        draw_y = [p.y for p in pts if not p.hovering]
        hover_x = [p.x for p in pts if p.hovering]
        hover_y = [p.y for p in pts if p.hovering]

        ax.scatter(
            draw_x,
            draw_y,
            s=8,
            c="#1f77b4",
            edgecolors="none",
            linewidths=0,
            alpha=0.9,
        )
        ax.scatter(
            hover_x,
            hover_y,
            s=7,
            c="#1f77b4",
            edgecolors="none",
            linewidths=0,
            alpha=0.2,
        )
        ax.scatter(
            pts[0].x,
            pts[0].y,
            c="green",
            s=35,
            label="start",
            zorder=3,
            edgecolors="none",
            linewidths=0,
        )
        ax.scatter(
            pts[-1].x,
            pts[-1].y,
            c="red",
            s=35,
            label="end",
            zorder=3,
            edgecolors="none",
            linewidths=0,
        )
        ax.set_title(name)
        ax.set_xlabel("x")
        ax.set_ylabel("y")
        ax.set_aspect("equal", adjustable="box")
        ax.grid(True, alpha=0.3)

    axes[5].axis("off")
    handles, labels = axes[0].get_legend_handles_labels()
    if handles:
        fig.legend(handles, labels, loc="upper right")

    fig.suptitle(f"Robot Emoji Paths (scale={scale})", fontsize=14)
    fig.tight_layout(rect=[0, 0, 1, 0.96])

    if output:
        fig.savefig(output, dpi=160, bbox_inches="tight")
        print(f"Saved plot to {output}")
    else:
        plt.show()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Visualize robot arm emoji drawing paths from robot_arm.pde geometry.",
    )
    parser.add_argument(
        "--scale",
        type=float,
        default=EMOJI_SCALE,
        help="Emoji scale factor (default: %(default)s)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Optional output image path (e.g., emoji_paths.png).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    plot_emoji_paths(scale=args.scale, output=args.output)


if __name__ == "__main__":
    main()
