// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { Modal, type App } from 'obsidian';
export class GalleryActionModal extends Modal {
  constructor(app: App, private heading: string, private render: (body: HTMLElement, close: () => void) => void) { super(app); }
  onOpen(): void {
    this.titleEl.textContent = this.heading;
    this.modalEl.setAttribute('aria-label', this.heading);
    this.contentEl.classList.add('vg-action-modal');
    this.render(this.contentEl, () => this.close());
  }
  onClose(): void { this.contentEl.replaceChildren(); }
}
