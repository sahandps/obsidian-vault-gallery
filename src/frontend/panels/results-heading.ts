// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { button, el } from '../dom';

export interface ResultsHeadingHost {
  clearFilters(): void;
  toggleSelectAll(): void;
}

/** The title above the grid, with Clear filters and Select all. */
export class ResultsHeading {
  private title: HTMLElement;
  private selectAll: HTMLButtonElement;

  constructor(parent: HTMLElement, host: ResultsHeadingHost) {
    const row = el(parent, 'div', 'vg-section-heading');
    this.title = el(row, 'h2', '', 'All media');
    button(row, 'Clear filters', null, () => host.clearFilters(), 'vg-text-button');
    this.selectAll = button(row, 'Select all', null, () => host.toggleSelectAll(), 'vg-text-button');
  }

  setTitle(text: string): void { this.title.textContent = text; }

  setSelectAll(everythingSelected: boolean, anyFiles: boolean): void {
    const label = everythingSelected ? 'Deselect all' : 'Select all';
    this.selectAll.textContent = label;
    this.selectAll.setAttribute('aria-label', label);
    this.selectAll.disabled = !anyFiles;
  }
}
