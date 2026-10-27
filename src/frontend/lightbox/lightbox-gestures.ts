// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { GestureHandlers } from './gestures';
import { contains, rubberBand, shouldDismiss, swipeDirection } from './geometry';
import type { SlideTrack } from './slide-track';

export interface LightboxGestureContext {
  stage: HTMLElement;
  track: SlideTrack;
  next(): void;
  previous(): void;
  close(): void;
  toggleChrome(): void;
  /** 0 when resting, up to 1 when dragged far enough to close. */
  setDismissProgress(progress: number): void;
}

const CONTROL_SELECTOR = 'button, input, textarea, select, a, audio';
const VIDEO_CONTROLS_HEIGHT = 64;

/** Connects touch, mouse and trackpad gestures to the slides: swipe between files, drag down to close, pinch and double-tap to zoom. */
export function createGestureHandlers(context: LightboxGestureContext): GestureHandlers {
  const { track, stage } = context;
  const image = () => track.current?.image ?? null;
  return {
    isZoomed: () => image()?.isZoomed ?? false,
    accepts(event) {
      const target = event.target as HTMLElement;
      if (target.closest(CONTROL_SELECTOR)) return false;
      const video = target.closest('video');
      // Leave a video's own controls, along the bottom, to the browser.
      return !video || video.getBoundingClientRect().bottom - event.clientY > VIDEO_CONTROLS_HEIGHT;
    },
    drag(axis, dx, dy) {
      if (axis === 'x') {
        const blocked = !track.hasNeighbor(dx < 0 ? 1 : -1);
        track.drag(blocked ? rubberBand(dx) : dx);
        return;
      }
      const current = image();
      if (!current) return;
      current.dismissDrag(dy);
      context.setDismissProgress(Math.min(Math.abs(dy) / (stage.clientHeight * 0.5), 1));
    },
    dragEnd(axis, dx, dy, velocityX, velocityY) {
      if (axis === 'x') {
        const direction = swipeDirection(dx, velocityX, track.width);
        if (direction !== 0 && track.hasNeighbor(direction)) { if (direction === 1) context.next(); else context.previous(); }
        else track.cancelDrag();
        return;
      }
      const current = image();
      if (!current) return;
      if (shouldDismiss(dy, velocityY, stage.clientHeight)) { context.close(); return; }
      current.releaseDismiss();
      context.setDismissProgress(0);
    },
    pan: (dx, dy) => image()?.panBy(dx, dy),
    pinch(factor, center, move) {
      const current = image();
      if (!current) return;
      current.zoomBy(factor, center);
      current.panBy(move.x, move.y);
    },
    tap(point) {
      const current = image();
      if (!current) return;
      // Tapping the picture shows or hides the controls; tapping the dark area around it closes.
      if (contains(current.baseRect(), point)) context.toggleChrome(); else context.close();
    },
    doubleTap: point => image()?.toggleZoom(point),
    wheelZoom: (factor, point) => image()?.zoomBy(factor, point),
    wheelPan: (dx, dy) => image()?.panBy(dx, dy),
  };
}
