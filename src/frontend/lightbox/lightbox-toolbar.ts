// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { button, el } from '../dom';

export interface ToolbarActions {
  previous: () => void;
  next: () => void;
  close: () => void;
  zoomBy: (step: number) => void;
  resetZoom: () => void;
}

/** Previous/next, position counter, zoom and close buttons above the preview. */
export class LightboxToolbar {
  private previous: HTMLButtonElement;
  private next: HTMLButtonElement;
  private position: HTMLElement;

  constructor(parent: HTMLElement, showZoom: boolean, actions: ToolbarActions) {
    const tools = el(parent, 'div', 'vg-preview-tools');
    this.previous = button(tools, 'Previous media', 'chevron-left', actions.previous, 'vg-icon-button');
    this.next = button(tools, 'Next media', 'chevron-right', actions.next, 'vg-icon-button');
    this.position = el(tools, 'span', 'vg-position');
    if (showZoom) {
      button(tools, 'Zoom out', 'minus', () => actions.zoomBy(-0.25), 'vg-icon-button');
      button(tools, 'Reset zoom', 'maximize', actions.resetZoom, 'vg-icon-button');
      button(tools, 'Zoom in', 'plus', () => actions.zoomBy(0.25), 'vg-icon-button');
    }
    button(tools, 'Close preview', 'x', actions.close, 'vg-icon-button vg-close');
  }

  updatePosition(index: number, total: number): void {
    this.previous.disabled = index <= 0;
    this.next.disabled = index >= total - 1;
    this.position.textContent = `${index + 1} of ${total}`;
  }

  focusButton(direction: number): void { (direction < 0 ? this.previous : this.next).focus(); }
}
