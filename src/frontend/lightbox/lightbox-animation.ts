// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { flipTransform, type Rect } from './geometry';
import type { ZoomableImage } from './zoomable-image';

const OPEN_MS = 280;
const CLOSE_MS = 240;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** Animations are skipped where the browser lacks the Web Animations API, or the user prefers less motion. */
function canAnimate(element: HTMLElement): boolean {
  const win = element.ownerDocument.defaultView;
  return typeof element.animate === 'function' && !win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function transformString(shift: { x: number; y: number; scale: number }): string {
  return `translate3d(${shift.x}px, ${shift.y}px, 0) scale(${shift.scale})`;
}

/** Only fly to or from a thumbnail that is actually on screen. */
function visibleRect(thumbnail: HTMLElement | undefined): Rect | undefined {
  if (!thumbnail?.isConnected) return undefined;
  const rect = thumbnail.getBoundingClientRect();
  const win = thumbnail.ownerDocument.defaultView;
  if (!win || rect.width < 2 || rect.bottom < 0 || rect.top > win.innerHeight || rect.right < 0 || rect.left > win.innerWidth) return undefined;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export interface AnimationTargets {
  backdrop: HTMLElement;
  slide: HTMLElement;
  image?: ZoomableImage;
  /** The grid thumbnail of this file, when it is on screen. */
  thumbnail?: HTMLElement;
}

/** Opens by growing the image out of its thumbnail. Returns the animations so they can be cancelled. */
export async function playOpen(targets: AnimationTargets): Promise<Animation[]> {
  const { backdrop, slide, image, thumbnail } = targets;
  if (!canAnimate(slide)) return [];
  const animations = [backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: 'ease-out' })];
  const from = visibleRect(thumbnail);
  if (image && from && await image.whenSized()) {
    const shift = flipTransform(from, image.baseRect());
    animations.push(image.element.animate(
      [{ transform: transformString(shift), opacity: 0.6 }, { transform: image.currentTransform(), opacity: 1 }],
      { duration: OPEN_MS, easing: EASE },
    ));
  } else {
    animations.push(slide.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'scale(1)' }], { duration: OPEN_MS, easing: EASE }));
  }
  return animations;
}

/** Closes by shrinking the image back into its thumbnail, or fading when the thumbnail is off screen. */
export function playClose(targets: AnimationTargets, backdropOpacity: number): Animation[] | null {
  const { backdrop, slide, image, thumbnail } = targets;
  if (!canAnimate(slide)) return null;
  const animations = [backdrop.animate([{ opacity: backdropOpacity }, { opacity: 0 }], { duration: CLOSE_MS, easing: 'ease-in', fill: 'forwards' })];
  const to = visibleRect(thumbnail);
  if (image && to && image.element.naturalWidth > 0) {
    const shift = flipTransform(to, image.baseRect());
    animations.push(image.element.animate(
      [{ transform: image.currentTransform(), opacity: 1 }, { transform: transformString(shift), opacity: 0.4 }],
      { duration: CLOSE_MS, easing: EASE, fill: 'forwards' },
    ));
  } else {
    animations.push(slide.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, easing: 'ease-in', fill: 'forwards' }));
  }
  return animations;
}
