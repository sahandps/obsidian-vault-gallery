// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { Notice, Plugin, TFolder, type TAbstractFile } from 'obsidian';
import { DataStore } from './backend/data/data-store';
import type { GalleryData } from './backend/data/gallery-data';
import { moveMetadata, removeMetadata } from './backend/data/metadata';
import { MediaImporter, type ImportResult } from './backend/services/media-importer';
import { MediaTrasher, type TrashResult, type TrashTarget } from './backend/services/media-trasher';
import { GalleryView, VIEW_TYPE } from './frontend/gallery-view';
import { GallerySettingsTab } from './frontend/settings/settings-tab';

/** Plugin entry point: loads saved data, registers the gallery view and keeps tags in step with the vault. */
export default class MediaHubPlugin extends Plugin {
  private store = new DataStore(data => this.saveData(data));
  private importer!: MediaImporter;
  private trasher!: MediaTrasher;
  private refreshTimer: number | undefined;

  get data(): GalleryData { return this.store.data; }

  async onload(): Promise<void> {
    try { this.store.load(await this.loadData()); }
    catch (error) {
      console.error('Media Hub could not load its data', error);
      new Notice('Media Hub could not load saved tags. Reload the plugin before editing tags.');
      // Do not overwrite an unreadable metadata file with defaults.
      return;
    }
    this.importer = new MediaImporter(this.app, () => this.data.importFolder);
    this.trasher = new MediaTrasher(this.app, () => this.data);
    this.addSettingTab(new GallerySettingsTab(this.app, this));
    this.registerView(VIEW_TYPE, leaf => new GalleryView(leaf, this));
    this.addRibbonIcon('images', 'Open Media Hub', () => { void this.activate(); });
    this.addCommand({ id: 'open-gallery', name: 'Open gallery', callback: () => { void this.activate(); } });
    this.registerVaultEvents();
  }

  onunload(): void { if (this.refreshTimer) window.clearTimeout(this.refreshTimer); }

  private registerVaultEvents(): void {
    const vault = this.app.vault;
    this.registerEvent(vault.on('create', () => this.scheduleRefresh()));
    this.registerEvent(vault.on('modify', () => this.scheduleRefresh()));
    this.registerEvent(vault.on('rename', (file, oldPath) => this.handleRename(file, oldPath)));
    this.registerEvent(vault.on('delete', file => {
      removeMetadata(this.data, file.path);
      this.saveQuietly();
      this.scheduleRefresh();
    }));
  }

  private handleRename(file: TAbstractFile, oldPath: string): void {
    moveMetadata(this.data, oldPath, file.path);
    const folder = this.data.importFolder;
    if (file instanceof TFolder && (folder === oldPath || folder.startsWith(`${oldPath}/`))) {
      this.data.importFolder = file.path + folder.slice(oldPath.length);
    }
    for (const view of this.views()) view.onPathMoved(oldPath, file.path);
    this.saveQuietly();
    this.scheduleRefresh();
  }

  private saveQuietly(): void { void this.persist().catch(error => this.reportSaveError(error)); }

  private views(): GalleryView[] {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE).map(leaf => leaf.view as GalleryView);
  }

  private async activate(): Promise<void> {
    try {
      let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
      if (!leaf) {
        leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
      }
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      console.error(error);
      new Notice('Could not open Media Hub. See the developer console for details.');
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => this.refreshViews(), 180);
  }

  applyViewSettings(): void { for (const view of this.views()) view.applySettings(); }
  refreshViews(): void { for (const view of this.views()) view.refresh(); }

  persist(): Promise<void> { return this.store.persist(); }

  async mutateData(change: (data: GalleryData) => void): Promise<void> {
    await this.store.mutate(change);
    this.refreshViews();
  }

  async importMedia(files: readonly File[], progress: (message: string) => void): Promise<ImportResult> {
    const result = await this.importer.importFiles(files, progress);
    this.refreshViews();
    return result;
  }

  async trashMedia(targets: readonly TrashTarget[]): Promise<TrashResult> {
    const result = await this.trasher.trash(targets);
    if (result.deleted.length) {
      try { await this.persist(); } catch (error) { this.reportSaveError(error); }
    }
    this.refreshViews();
    return result;
  }

  reportSaveError(error: unknown): void {
    console.error('Media Hub save failed', error);
    new Notice('Could not save gallery data. Check that your vault is writable.');
  }
}
