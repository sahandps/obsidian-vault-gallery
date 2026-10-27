// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { Notice, type App } from 'obsidian';
import { mediaAccept } from '../../backend/media/media-kinds';
import type MediaHubPlugin from '../../plugin';
import { GallerySettingsModal } from '../settings/settings-modal';
import { button, el } from '../dom';

export interface HeaderHost {
  sidebarId: string;
  refresh(): void;
  /** Called after files were imported, with the new paths. */
  imported(paths: string[]): void;
}

/** Title bar: folder pane toggle, file counter, Add media, settings and refresh. */
export class GalleryHeader {
  private counter: HTMLElement;
  private sidebarToggle: HTMLButtonElement;

  constructor(parent: HTMLElement, private app: App, private plugin: MediaHubPlugin, private host: HeaderHost) {
    const header = el(parent, 'header', 'vg-header');
    this.sidebarToggle = button(header, 'Toggle folder pane', 'panel-left', () => this.toggleSidebar(), 'vg-icon-button vg-sidebar-toggle');
    this.sidebarToggle.setAttribute('aria-controls', host.sidebarId);
    const heading = el(header, 'div', 'vg-header-heading');
    el(heading, 'div', 'vg-eyebrow', 'YOUR VAULT, IN VIEW');
    el(heading, 'h1', '', 'Media library');
    const actions = el(header, 'div', 'vg-header-actions');
    this.counter = el(actions, 'span', 'vg-counter');
    this.counter.setAttribute('role', 'status');
    this.addImportControls(actions);
    button(actions, 'Gallery settings', 'settings', () => new GallerySettingsModal(this.app, this.plugin).open(), 'vg-icon-button');
    button(actions, 'Refresh library', 'refresh-cw', () => host.refresh(), 'vg-icon-button');
  }

  setCount(shown: number, total: number): void { this.counter.textContent = `${shown} / ${total} files`; }

  applySettings(): void {
    const collapsed = this.plugin.data.sidebarCollapsed;
    this.sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    this.sidebarToggle.title = collapsed ? 'Show folder pane' : 'Hide folder pane';
  }

  private toggleSidebar(): void {
    const previous = this.plugin.data.sidebarCollapsed;
    this.plugin.data.sidebarCollapsed = !previous;
    this.plugin.applyViewSettings();
    void this.plugin.persist().catch(error => {
      this.plugin.data.sidebarCollapsed = previous;
      this.plugin.applyViewSettings();
      this.plugin.reportSaveError(error);
    });
  }

  private addImportControls(actions: HTMLElement): void {
    const picker = el(actions, 'input');
    picker.type = 'file'; picker.multiple = true; picker.accept = mediaAccept(); picker.hidden = true;
    picker.setAttribute('aria-label', 'Choose media files');
    const importButton = button(actions, 'Add media', null, () => picker.click(), 'mod-cta vg-add-media');
    const status = el(actions, 'span', 'vg-import-status');
    status.setAttribute('role', 'status');
    picker.addEventListener('change', () => {
      const files = Array.from(picker.files || []);
      picker.value = '';
      if (!files.length) return;
      importButton.disabled = true;
      void this.plugin.importMedia(files, message => { status.textContent = message; }).then(result => {
        const message = `${result.paths.length} imported${result.failed.length ? `, ${result.failed.length} failed` : ''}.`;
        status.textContent = message;
        if (result.paths.length) this.host.imported(result.paths);
        new Notice(result.failed.length ? `${message} Could not import: ${result.failed.join(', ')}` : message);
      }).catch(error => {
        status.textContent = 'Import failed.';
        console.error(error); new Notice('Could not import media. Check the destination folder.');
      }).finally(() => { importButton.disabled = false; });
    });
  }
}
