// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { TFile } from 'obsidian';
import { el } from '../dom';
import type { MediaSlide } from './media-slide';

const SETTLE_MS = 260;

export interface TrackFiles { previous?: TFile; current: TFile; next?: TFile }
interface Entry { slide: MediaSlide; role: number; leaving?: boolean }

/**
 * Holds the previous, current and next slides side by side. Dragging moves them with the finger,
 * and changing the current file slides them into place.
 */
export class SlideTrack {
  readonly element: HTMLElement;
  private entries: Entry[] = [];
  private settleTimer: number | undefined;

  constructor(parent: HTMLElement, private createSlide: (file: TFile, opening: boolean) => MediaSlide) {
    this.element = el(parent, 'div', 'vg-track');
  }

  get current(): MediaSlide | undefined { return this.entries.find(entry => entry.role === 0)?.slide; }
  get width(): number { return this.element.clientWidth || 1; }

  hasNeighbor(direction: -1 | 1): boolean { return this.entries.some(entry => entry.role === direction); }

  /** Which way the track must slide to reach this file: 1 for next, -1 for previous, 0 if it is not adjacent. */
  directionTo(path: string): -1 | 0 | 1 {
    const role = this.entries.find(entry => entry.slide.file.path === path)?.role;
    return role === 1 ? 1 : role === -1 ? -1 : 0;
  }

  /** Moves every slide by a finger drag, in pixels. */
  drag(dx: number): void { this.element.setCssProps({ '--vg-drag': `${dx}px` }); }

  /** Slides back after a drag that was not far enough. */
  cancelDrag(): void {
    this.element.classList.add('is-settling');
    this.drag(0);
    this.startSettleTimer();
  }

  /**
   * Shows the given files. A direction of 1 or -1 slides from where the track is now (including any
   * drag in progress); 0 swaps instantly.
   */
  show(files: TrackFiles, direction: -1 | 0 | 1, opening: boolean): void {
    this.finishSettling();
    const previous = new Map(this.entries.map(entry => [entry.slide.file.path, entry]));
    const wanted: [TFile | undefined, number][] = [[files.previous, -1], [files.current, 0], [files.next, 1]];
    const kept: Entry[] = [];
    for (const [file, role] of wanted) {
      if (!file) continue;
      const existing = previous.get(file.path);
      previous.delete(file.path);
      kept.push(existing ? { slide: existing.slide, role } : { slide: this.createSlide(file, opening && role === 0), role });
    }
    // Slides leaving the track stay put visually until the slide animation ends.
    const leaving = [...previous.values()].map(entry => ({ slide: entry.slide, role: entry.role - direction, leaving: true }));
    for (const entry of [...kept, ...leaving]) entry.slide.setRole(entry.role);
    for (const entry of kept) entry.slide.setCurrent(entry.role === 0);
    for (const entry of leaving) entry.slide.setCurrent(false);
    this.entries = [...kept, ...leaving];
    if (direction === 0) { this.removeLeaving(); return; }
    this.element.setCssProps({ '--vg-shift': String(direction) });
    void this.element.offsetWidth; // Apply the starting position before animating away from it.
    this.element.classList.add('is-settling');
    this.element.setCssProps({ '--vg-shift': '0', '--vg-drag': '0px' });
    this.startSettleTimer();
  }

  clear(): void {
    this.finishSettling();
    for (const entry of this.entries) entry.slide.dispose();
    this.entries = [];
    this.element.setCssProps({ '--vg-drag': '0px', '--vg-shift': '0' });
  }

  private startSettleTimer(): void {
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => this.finishSettling(), SETTLE_MS);
  }

  private finishSettling(): void {
    window.clearTimeout(this.settleTimer);
    this.settleTimer = undefined;
    this.element.classList.remove('is-settling');
    this.element.setCssProps({ '--vg-shift': '0' });
    this.removeLeaving();
  }

  private removeLeaving(): void {
    for (const entry of this.entries) if (entry.leaving) entry.slide.dispose();
    this.entries = this.entries.filter(entry => !entry.leaving);
  }
}
