// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { setIcon } from 'obsidian';
import { el } from '../dom';

/** Explains that a file cannot be shown on this device. */
export function showUnavailable(parent: HTMLElement, message: string): void {
  setIcon(el(parent, 'div', 'vg-audio-art'), 'file-question');
  el(parent, 'p', 'vg-preview-message', message);
  el(parent, 'p', 'vg-hint', 'Use “Open in Obsidian” or open the file in your system’s media app.');
}
