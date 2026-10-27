// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only

export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Rect extends Size { left: number; top: number }
/** Zoom and pan of an image. `x` and `y` are offsets from the centre of its box, in pixels. */
export interface View { scale: number; x: number; y: number }

export const MIN_SCALE = 1;
export const MAX_SCALE = 6;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function clampScale(scale: number): number { return clamp(scale, MIN_SCALE, MAX_SCALE); }

export function distance(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y); }
export function midpoint(a: Point, b: Point): Point { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

export function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.left && point.x <= rect.left + rect.width && point.y >= rect.top && point.y <= rect.top + rect.height;
}

/** The area an image of this natural size takes up when fitted, centred and undistorted, inside a box. */
export function containRect(box: Rect, natural: Size): Rect {
  if (!(natural.width > 0) || !(natural.height > 0)) return box;
  const fit = Math.min(box.width / natural.width, box.height / natural.height);
  const width = natural.width * fit;
  const height = natural.height * fit;
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}

/** Changes the zoom while keeping the point under `focus` (measured from the box centre) in place. */
export function zoomAround(view: View, focus: Point, nextScale: number): View {
  const scale = clampScale(nextScale);
  const ratio = scale / view.scale;
  return { scale, x: focus.x - (focus.x - view.x) * ratio, y: focus.y - (focus.y - view.y) * ratio };
}

/** Stops a zoomed image being dragged past its edges. `content` is its size at scale 1. */
export function clampPan(view: View, content: Size, viewport: Size): View {
  const limitX = Math.max(0, (content.width * view.scale - viewport.width) / 2);
  const limitY = Math.max(0, (content.height * view.scale - viewport.height) / 2);
  return { scale: view.scale, x: clamp(view.x, -limitX, limitX), y: clamp(view.y, -limitY, limitY) };
}

/** 1 to go to the next item (swiped left), -1 for the previous one, 0 to stay. Velocity is in px per ms. */
export function swipeDirection(dx: number, velocityX: number, width: number): -1 | 0 | 1 {
  const farEnough = Math.abs(dx) > width * 0.25;
  const fastEnough = Math.abs(velocityX) > 0.5 && Math.abs(dx) > 30;
  if (!farEnough && !fastEnough) return 0;
  return dx < 0 ? 1 : -1;
}

/** Whether a vertical drag should close the viewer. */
export function shouldDismiss(dy: number, velocityY: number, height: number): boolean {
  return Math.abs(dy) > height * 0.2 || (Math.abs(velocityY) > 0.6 && Math.abs(dy) > 40);
}

/** Dragging past an edge with nothing beyond it moves only a little. */
export function rubberBand(distanceMoved: number): number { return distanceMoved * 0.3; }

/**
 * The transform that makes `content` (sitting at rest) cover `target`, used to fly an image
 * between its grid thumbnail and its full-size position.
 */
export function flipTransform(target: Rect, content: Rect): { x: number; y: number; scale: number } {
  return {
    x: target.left + target.width / 2 - (content.left + content.width / 2),
    y: target.top + target.height / 2 - (content.top + content.height / 2),
    scale: Math.max(target.width / content.width, target.height / content.height),
  };
}
