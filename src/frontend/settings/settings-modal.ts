// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { Modal, type App } from 'obsidian';
import type MediaHubPlugin from '../../plugin';
import { renderSettings } from './settings-form';

/** The settings dialog opened by the gallery's gear button. */
export class GallerySettingsModal extends Modal {
  constructor(app: App, private plugin: MediaHubPlugin) { super(app); }
  onOpen(): void {
    this.titleEl.textContent = 'Gallery settings';
    renderSettings(this.contentEl, this.plugin);
  }
  onClose(): void { this.contentEl.replaceChildren(); }
}
