// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { App, TFile } from 'obsidian';
import { el } from '../dom';
import { MAX_SCALE, clampPan, clampScale, containRect, zoomAround, type Point, type Rect, type View } from './geometry';

const DOUBLE_TAP_SCALE = 2.5;
const BUTTON_ZOOM = 1.5;
const SNAP_MS = 220;

export interface ZoomableImageOptions {
  /** A small version to show at once while the full image loads. */
  placeholder?: string;
  /** Called with the full image's size once it has loaded. */
  loaded(width: number, height: number): void;
  failed(): void;
}

/** An image that can be zoomed, panned and dragged down to dismiss. */
export class ZoomableImage {
  readonly element: HTMLImageElement;
  private view: View = { scale: 1, x: 0, y: 0 };
  /** What is on screen right now, which differs from `view` while dragging to dismiss. */
  private shown: View = this.view;
  private snapTimer: number | undefined;

  constructor(parent: HTMLElement, file: TFile, app: App, options: ZoomableImageOptions) {
    this.element = el(parent, 'img', 'vg-slide-image');
    this.element.alt = file.name;
    this.element.draggable = false;
    const full = app.vault.getResourcePath(file);
    this.element.src = options.placeholder && options.placeholder !== full ? options.placeholder : full;
    this.element.addEventListener('error', () => { if (this.element.src === full) options.failed(); });
    if (this.element.src === full) {
      this.element.addEventListener('load', () => options.loaded(this.element.naturalWidth, this.element.naturalHeight));
      return;
    }
    // Swap in the full image once it has downloaded, so the placeholder never flashes blank.
    const Loader = parent.ownerDocument.defaultView!.Image;
    const loader = new Loader();
    loader.onload = () => { this.element.src = full; options.loaded(loader.naturalWidth, loader.naturalHeight); };
    loader.onerror = () => { this.element.src = full; };
    loader.src = full;
  }

  get scale(): number { return this.view.scale; }
  get isZoomed(): boolean { return this.view.scale > 1.01; }

  private get box(): Rect {
    const rect = this.element.getBoundingClientRect();
    const parent = this.element.parentElement?.getBoundingClientRect() ?? rect;
    return { left: parent.left, top: parent.top, width: parent.width, height: parent.height };
  }

  private get natural() { return { width: this.element.naturalWidth, height: this.element.naturalHeight }; }

  /** Where the image sits on screen when not zoomed or moved. */
  baseRect(): Rect { return containRect(this.box, this.natural); }

  /** True once the browser knows the image's size, so it can be measured. */
  whenSized(timeoutMs = 700): Promise<boolean> {
    if (this.element.naturalWidth > 0) return Promise.resolve(true);
    return new Promise(resolve => {
      const done = (ok: boolean) => { window.clearTimeout(timer); resolve(ok); };
      const timer = window.setTimeout(() => done(false), timeoutMs);
      this.element.addEventListener('load', () => done(true), { once: true });
      this.element.addEventListener('error', () => done(false), { once: true });
    });
  }

  currentTransform(): string { return `translate3d(${this.shown.x}px, ${this.shown.y}px, 0) scale(${this.shown.scale})`; }

  /** Zoom by a factor around a screen point. */
  zoomBy(factor: number, point?: Point): void { this.setView(zoomAround(this.view, this.focus(point), this.view.scale * factor)); }

  /** Zoom in or out one step, as used by the toolbar buttons. */
  step(zoomIn: boolean): void { this.animateTo(zoomAround(this.view, { x: 0, y: 0 }, zoomIn ? this.view.scale * BUTTON_ZOOM : this.view.scale / BUTTON_ZOOM)); }

  toggleZoom(point?: Point): void {
    const target = this.isZoomed ? 1 : DOUBLE_TAP_SCALE;
    this.animateTo(zoomAround(this.view, this.focus(point), target));
  }

  panBy(dx: number, dy: number): void { this.setView({ ...this.view, x: this.view.x + dx, y: this.view.y + dy }); }

  reset(animated = true): void { this.animateTo({ scale: 1, x: 0, y: 0 }, animated); }

  /** Follows a downward drag, shrinking slightly as it goes. */
  dismissDrag(dy: number): void {
    const scale = 1 - Math.min(Math.abs(dy) / 1200, 0.25);
    this.apply({ scale, x: 0, y: dy });
  }

  private focus(point?: Point): Point {
    if (!point) return { x: 0, y: 0 };
    const box = this.box;
    return { x: point.x - (box.left + box.width / 2), y: point.y - (box.top + box.height / 2) };
  }

  private setView(next: View): void {
    const box = this.box;
    const content = this.baseRect();
    this.view = clampScale(next.scale) <= 1 ? { scale: 1, x: 0, y: 0 } : clampPan({ ...next, scale: Math.min(next.scale, MAX_SCALE) }, content, box);
    this.apply(this.view);
  }

  private animateTo(next: View, animated = true): void {
    if (animated) this.snap();
    this.setView(next);
  }

  private snap(): void {
    this.element.classList.add('is-snapping');
    window.clearTimeout(this.snapTimer);
    this.snapTimer = window.setTimeout(() => this.element.classList.remove('is-snapping'), SNAP_MS);
  }

  private apply(view: View): void {
    this.shown = view;
    this.element.setCssProps({ '--vg-x': `${view.x}px`, '--vg-y': `${view.y}px`, '--vg-scale': String(view.scale) });
    this.element.classList.toggle('is-zoomed', view.scale > 1.01);
  }

  /** Puts the image back after a dismiss drag that was not far enough. */
  releaseDismiss(): void { this.snap(); this.apply(this.view); }
}
