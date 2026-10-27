// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { button, el } from '../dom';

export interface SelectionBarHost {
  clear(): void;
  addTags(paths: string[]): void;
  addToCollection(paths: string[]): void;
  removeFromCollection(paths: string[], button: HTMLButtonElement): void;
  download(paths: string[]): void;
  deleteFiles(paths: string[]): void;
}

/** The action bar that appears while files are checked. */
export class SelectionBar {
  private element: HTMLElement;

  constructor(parent: HTMLElement, private host: SelectionBarHost) {
    this.element = el(parent, 'div', 'vg-selection-bar');
    this.element.setAttribute('aria-label', 'Selected file actions');
    this.element.hidden = true;
  }

  /** Shows the actions for the checked paths, or hides the bar when nothing is checked. */
  render(paths: string[], inCollection: boolean): void {
    this.element.replaceChildren();
    this.element.hidden = !paths.length;
    if (!paths.length) return;
    const host = this.host;
    const count = el(this.element, 'strong', '', `${paths.length} selected`);
    count.setAttribute('role', 'status');
    button(this.element, 'Clear selection', null, () => host.clear(), 'vg-text-button');
    button(this.element, 'Add tags', null, () => host.addTags(paths));
    button(this.element, 'Add to collection', null, () => host.addToCollection(paths));
    if (inCollection) {
      const remove = button(this.element, 'Remove from collection', null, () => host.removeFromCollection(paths, remove));
    }
    button(this.element, 'Download', null, () => host.download(paths));
    button(this.element, 'Delete files', null, () => host.deleteFiles(paths), 'vg-delete-button');
  }
}
