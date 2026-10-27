// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { distance, midpoint, type Point } from './geometry';

export type Axis = 'x' | 'y';

/** What the viewer wants to know about touches, mouse drags and the wheel. Moves are reported as changes since the last call. */
export interface GestureHandlers {
  isZoomed(): boolean;
  /** Return false to leave a touch that starts on a control alone. */
  accepts(event: PointerEvent): boolean;
  drag(axis: Axis, dx: number, dy: number): void;
  /** Velocities are in pixels per millisecond. */
  dragEnd(axis: Axis, dx: number, dy: number, velocityX: number, velocityY: number): void;
  pan(dx: number, dy: number): void;
  pinch(factor: number, center: Point, move: Point): void;
  tap(point: Point): void;
  doubleTap(point: Point): void;
  wheelZoom(factor: number, point: Point): void;
  wheelPan(dx: number, dy: number): void;
}

const MOVE_THRESHOLD = 8;
const TAP_MAX_MS = 300;
const DOUBLE_TAP_MS = 280;
const VELOCITY_WINDOW_MS = 100;

interface Sample { x: number; y: number; time: number }

/** Turns raw pointer events into drags, pans, pinches, taps and double taps. */
export class GestureSurface {
  private pointers = new Map<number, Point>();
  private origin: Point = { x: 0, y: 0 };
  private previous: Point = { x: 0, y: 0 };
  private startedAt = 0;
  private moved = false;
  private axis: Axis | null = null;
  private pinching = false;
  private pinchDistance = 0;
  private pinchCenter: Point = { x: 0, y: 0 };
  private samples: Sample[] = [];
  private lastTap: (Point & { time: number }) | null = null;
  private tapTimer: number | undefined;
  private listeners: [string, EventListener][] = [];

  constructor(private element: HTMLElement, private handlers: GestureHandlers) {
    this.listen('pointerdown', event => this.down(event as PointerEvent));
    this.listen('pointermove', event => this.move(event as PointerEvent));
    this.listen('pointerup', event => this.up(event as PointerEvent));
    this.listen('pointercancel', event => this.up(event as PointerEvent));
    this.listen('wheel', event => this.wheel(event as WheelEvent));
  }

  dispose(): void {
    for (const [type, listener] of this.listeners) this.element.removeEventListener(type, listener);
    this.listeners = [];
    window.clearTimeout(this.tapTimer);
  }

  private listen(type: string, listener: EventListener): void {
    this.element.addEventListener(type, listener, { passive: false });
    this.listeners.push([type, listener]);
  }

  private down(event: PointerEvent): void {
    if (!this.handlers.accepts(event)) return;
    try { this.element.setPointerCapture(event.pointerId); } catch { /* Not a live pointer, so nothing to capture. */ }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 1) this.beginSingle({ x: event.clientX, y: event.clientY });
    else if (this.pointers.size === 2) this.beginPinch();
  }

  private beginSingle(point: Point): void {
    this.origin = { x: point.x, y: point.y };
    this.previous = { ...this.origin };
    this.startedAt = performance.now();
    this.moved = false; this.axis = null;
    this.samples = [{ ...this.origin, time: this.startedAt }];
  }

  private beginPinch(): void {
    if (this.axis) this.handlers.dragEnd(this.axis, 0, 0, 0, 0);
    this.axis = null; this.moved = true; this.pinching = true;
    const [a, b] = [...this.pointers.values()];
    this.pinchDistance = distance(a, b) || 1;
    this.pinchCenter = midpoint(a, b);
  }

  private move(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pinching && this.pointers.size >= 2) return this.movePinch();
    if (this.pointers.size !== 1) return;
    const point = { x: event.clientX, y: event.clientY };
    const dx = point.x - this.origin.x;
    const dy = point.y - this.origin.y;
    if (!this.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
    this.moved = true;
    this.recordSample(point);
    if (this.handlers.isZoomed()) this.handlers.pan(point.x - this.previous.x, point.y - this.previous.y);
    else {
      this.axis ??= Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      this.handlers.drag(this.axis, dx, dy);
    }
    this.previous = point;
    event.preventDefault();
  }

  private movePinch(): void {
    const [a, b] = [...this.pointers.values()];
    const center = midpoint(a, b);
    const spread = distance(a, b) || 1;
    this.handlers.pinch(spread / this.pinchDistance, center, { x: center.x - this.pinchCenter.x, y: center.y - this.pinchCenter.y });
    this.pinchDistance = spread; this.pinchCenter = center;
  }

  private up(event: PointerEvent): void {
    if (!this.pointers.delete(event.pointerId)) return;
    if (this.pinching) {
      if (this.pointers.size < 2) {
        this.pinching = false;
        const [rest] = [...this.pointers.values()];
        if (rest) { this.beginSingle(rest); this.moved = true; }
      }
      return;
    }
    if (this.pointers.size > 0) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!this.moved) { if (performance.now() - this.startedAt < TAP_MAX_MS && event.type === 'pointerup') this.registerTap(point); return; }
    if (this.axis) {
      const { vx, vy } = this.velocity();
      this.handlers.dragEnd(this.axis, point.x - this.origin.x, point.y - this.origin.y, vx, vy);
    }
    this.axis = null;
  }

  private recordSample(point: Point): void {
    const time = performance.now();
    this.samples.push({ ...point, time });
    while (this.samples.length > 2 && time - this.samples[0].time > VELOCITY_WINDOW_MS) this.samples.shift();
  }

  private velocity(): { vx: number; vy: number } {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const elapsed = last.time - first.time;
    return elapsed > 0 ? { vx: (last.x - first.x) / elapsed, vy: (last.y - first.y) / elapsed } : { vx: 0, vy: 0 };
  }

  private registerTap(point: Point): void {
    const now = performance.now();
    const last = this.lastTap;
    if (last && now - last.time < DOUBLE_TAP_MS && distance(last, point) < 40) {
      window.clearTimeout(this.tapTimer);
      this.lastTap = null;
      this.handlers.doubleTap(point);
      return;
    }
    this.lastTap = { ...point, time: now };
    this.tapTimer = window.setTimeout(() => { this.lastTap = null; this.handlers.tap(point); }, DOUBLE_TAP_MS);
  }

  private wheel(event: WheelEvent): void {
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    // Pinching on a trackpad arrives as a wheel event with ctrlKey set.
    if (event.ctrlKey) this.handlers.wheelZoom(Math.exp(-event.deltaY * 0.01), point);
    else if (this.handlers.isZoomed()) this.handlers.wheelPan(-event.deltaX, -event.deltaY);
  }
}
