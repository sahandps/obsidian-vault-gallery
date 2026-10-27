// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { Notice, type App, type TFile } from 'obsidian';
import { getMetadata } from '../../backend/data/metadata';
import { formatSize, renamedPath } from '../../backend/media/file-names';
import type { MediaKind } from '../../backend/media/media-kinds';
import type MediaHubPlugin from '../../plugin';
import { TagEditor } from '../components/tag-editor';
import { button, el } from '../dom';

export interface InspectorDraft { tags: string[]; description: string }
export interface InspectorHost {
  app: App;
  plugin: MediaHubPlugin;
  knownTags(): string[];
  download(path: string): void;
  openFile(file: TFile): void;
  /** Renames the file and re-opens the preview on the new path. Throws if Obsidian refuses. */
  renameFile(file: TFile, newPath: string, draft: InspectorDraft): Promise<void>;
}
export interface InspectorOptions extends InspectorHost {
  /** Clicks Save details on the freshly opened inspector after a rename. */
  saveAgain(): void;
}

/** The right-hand panel: file name, details, tags, description and file actions. */
export class FileInspector {
  private nameInput!: HTMLInputElement;
  private renameStatus!: HTMLElement;
  private renameButton!: HTMLButtonElement;
  private saveButton!: HTMLButtonElement;
  private description!: HTMLTextAreaElement;
  private tags!: TagEditor;
  private info: HTMLElement | null = null;

  constructor(parent: HTMLElement, private file: TFile, kind: MediaKind | undefined, private host: InspectorOptions) {
    const inspector = el(parent, 'aside', 'vg-inspector');
    el(inspector, 'div', 'vg-eyebrow', 'FILE DETAILS');
    this.buildNameField(inspector);
    this.buildDetails(inspector, kind);
    this.buildTagsAndDescription(inspector);
    this.buildSaveButton(inspector);
    button(inspector, 'Download', 'download', () => host.download(file.path), 'vg-open-file');
    button(inspector, 'Open in Obsidian', 'external-link', () => host.openFile(file), 'vg-open-file');
  }

  setInfo(text: string): void { if (this.info) this.info.textContent = text; }
  addTags(tags: readonly string[]): void { this.tags.addTags(tags); }
  clickSave(): void { this.saveButton.click(); }

  restoreDraft(draft: InspectorDraft): void {
    this.tags.setTags(draft.tags);
    this.description.value = draft.description;
  }

  private get stem(): string { return this.file.name.slice(0, -(this.file.extension.length + 1)); }

  private buildNameField(inspector: HTMLElement): void {
    const label = el(inspector, 'label', 'vg-field vg-filename-label');
    el(label, 'span', '', 'File name');
    const row = el(label, 'span', 'vg-filename-row');
    this.nameInput = el(row, 'input', 'vg-filename');
    this.nameInput.type = 'text';
    this.nameInput.value = this.stem;
    this.nameInput.setAttribute('aria-label', 'File name');
    el(row, 'span', 'vg-extension', `.${this.file.extension}`);
    this.renameStatus = el(inspector, 'p', 'vg-hint vg-rename-status');
    this.renameStatus.setAttribute('role', 'status');
    this.renameButton = button(inspector, 'Rename file', null, () => { void this.rename(); }, 'vg-rename');
    this.nameInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); this.renameButton.click(); }
    });
  }

  private buildDetails(inspector: HTMLElement, kind: MediaKind | undefined): void {
    const file = this.file;
    el(inspector, 'div', 'vg-detail-path', file.path);
    const details = el(inspector, 'dl', 'vg-details');
    const row = (label: string, value: string) => { el(details, 'dt', '', label); return el(details, 'dd', '', value); };
    row('Format', file.extension.toUpperCase());
    row('Size', formatSize(file.stat.size));
    const info = row(kind === 'audio' || kind === 'video' ? 'Duration' : 'Dimensions', '—');
    if (kind === 'pdf') { info.previousElementSibling?.remove(); info.remove(); } else this.info = info;
    row('Created', new Date(file.stat.ctime).toLocaleDateString());
    row('Modified', new Date(file.stat.mtime).toLocaleDateString());
  }

  private buildTagsAndDescription(inspector: HTMLElement): void {
    const metadata = getMetadata(this.host.plugin.data, this.file.path);
    const tagLabel = el(inspector, 'div', 'vg-field');
    el(tagLabel, 'span', '', 'Tags');
    this.tags = new TagEditor(tagLabel, metadata.tags, () => this.host.knownTags(), () => this.markDirty());
    el(inspector, 'p', 'vg-hint', 'Press Enter or comma to add a tag.');
    const label = el(inspector, 'label', 'vg-field');
    el(label, 'span', '', 'Description');
    this.description = el(label, 'textarea');
    this.description.rows = 3; this.description.value = metadata.description; this.description.placeholder = 'Add a little context…';
    this.description.addEventListener('input', () => this.markDirty());
  }

  private buildSaveButton(inspector: HTMLElement): void {
    this.saveButton = button(inspector, 'Save details', null, () => this.save(), 'mod-cta vg-save');
  }

  private markDirty(): void { if (this.saveButton) this.saveButton.textContent = 'Save details'; }

  private setBusy(busy: boolean): void {
    this.renameButton.disabled = busy; this.saveButton.disabled = busy; this.nameInput.disabled = busy;
    this.tags.setDisabled(busy); this.description.disabled = busy;
  }

  private save(): void {
    // Save also commits an edited filename, so changes cannot be silently ignored.
    if (this.nameInput.value.trim() !== this.stem) {
      void this.rename().then(success => { if (success) this.host.saveAgain(); });
      return;
    }
    const plugin = this.host.plugin;
    const path = this.file.path;
    const old = getMetadata(plugin.data, path);
    plugin.data.metadata[path] = { tags: this.tags.getTags(), description: this.description.value.trim() };
    this.setBusy(true); this.saveButton.textContent = 'Saving…';
    void plugin.persist().then(() => {
      this.setBusy(false); this.saveButton.textContent = 'Saved';
      this.tags.setTags(getMetadata(plugin.data, path).tags);
      plugin.refreshViews();
    }).catch(error => {
      plugin.data.metadata[path] = old;
      this.setBusy(false); this.saveButton.textContent = 'Retry save';
      plugin.reportSaveError(error);
    });
  }

  private async rename(): Promise<boolean> {
    this.renameStatus.textContent = '';
    let newPath: string;
    try {
      newPath = renamedPath(this.file, this.nameInput.value);
      if (newPath === this.file.path) { this.renameStatus.textContent = 'The name is unchanged.'; return false; }
      if (this.host.app.vault.getAbstractFileByPath(newPath)) throw new Error('A file with this name already exists in this folder.');
    } catch (error) {
      this.renameStatus.textContent = error instanceof Error ? error.message : 'Invalid file name.';
      this.nameInput.focus();
      return false;
    }
    const draft = { tags: this.tags.getTags(), description: this.description.value };
    this.setBusy(true); this.renameButton.textContent = 'Renaming…';
    try {
      await this.host.renameFile(this.file, newPath, draft);
      new Notice('File renamed.');
      return true;
    } catch (error) {
      console.error('Media Hub rename failed', error);
      this.renameStatus.textContent = error instanceof Error ? error.message : 'Could not rename this file.';
      this.setBusy(false); this.renameButton.textContent = 'Rename file';
      return false;
    }
  }
}
