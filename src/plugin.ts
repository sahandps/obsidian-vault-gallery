// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { Notice, Plugin, requestUrl, TFolder, type TAbstractFile } from 'obsidian';
import { DataStore } from './backend/data/data-store';
import type { GalleryData } from './backend/data/gallery-data';
import { ImmichClient, normalizeServer } from './backend/immich/client';
import { immichSecrets } from './backend/immich/secrets';
import { IMMICH_BLOCK } from './backend/immich/references';
import { ImmichEmbed } from './frontend/immich/media';
import { moveMetadata, removeMetadata } from './backend/data/metadata';
import { MediaImporter, type ImportResult } from './backend/services/media-importer';
import { mediaKind } from './backend/media/media-kinds';
import { ThumbnailCache } from './backend/services/thumbnail-cache';
import { ThumbnailService } from './backend/services/thumbnail-service';
import { MediaTrasher, type TrashResult, type TrashTarget } from './backend/services/media-trasher';
import { GalleryView, VIEW_TYPE } from './frontend/gallery-view';
import { GallerySettingsTab } from './frontend/settings/settings-tab';

/** Plugin entry point: loads saved data, registers the gallery view and keeps tags in step with the vault. */
export default class MediaHubPlugin extends Plugin {
  private store = new DataStore(data => this.saveData(data));
  private importer!: MediaImporter;
  private trasher!: MediaTrasher;
  thumbnails!: ThumbnailService;
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
    this.thumbnails = new ThumbnailService(this.app, new ThumbnailCache(typeof indexedDB === 'undefined' ? undefined : indexedDB));
    this.addSettingTab(new GallerySettingsTab(this.app, this));
    this.registerView(VIEW_TYPE, leaf => new GalleryView(leaf, this));
    this.addRibbonIcon('images', 'Open Media Hub', () => { void this.activate(); });
    this.addCommand({ id: 'open-gallery', name: 'Open gallery', callback: () => { void this.activate(); } });
    this.registerVaultEvents();
    this.registerMarkdownCodeBlockProcessor(IMMICH_BLOCK, (source, element, context) => {
      context.addChild(new ImmichEmbed(element, source, this));
    });
  }

  onunload(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.thumbnails?.dispose();
  }

  private registerVaultEvents(): void {
    const vault = this.app.vault;
    // Only media files change the gallery, so other notes being edited do not cause redraws.
    this.registerEvent(vault.on('create', file => this.refreshForMedia(file)));
    this.registerEvent(vault.on('modify', file => this.refreshForMedia(file)));
    this.registerEvent(vault.on('rename', (file, oldPath) => this.handleRename(file, oldPath)));
    this.registerEvent(vault.on('delete', file => {
      removeMetadata(this.data, file.path);
      this.thumbnails.forget(file.path);
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

  private refreshForMedia(file: TAbstractFile): void {
    if ('extension' in file && mediaKind(String(file.extension))) this.scheduleRefresh();
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

  immichClient(expectedServer?: string): ImmichClient | null {
    const connection = this.data.immich;
    if (!connection || (expectedServer && expectedServer !== connection.server)) return null;
    const key = immichSecrets(this.app)?.getSecret(connection.secretId);
    if (!key) return null;
    return new ImmichClient(connection.server, key, async request => {
      // Previously rendered notes may keep a client after the user disconnects or replaces the key.
      if (this.data.immich?.secretId !== connection.secretId || immichSecrets(this.app)?.getSecret(connection.secretId) !== key) {
        throw new Error('Immich connection changed.');
      }
      return await requestUrl(request);
    });
  }

  async connectImmich(server: string, key: string): Promise<void> {
    const secrets = immichSecrets(this.app);
    if (!secrets) throw new Error('Update Obsidian to 1.11.4 or newer to store an Immich API key.');
    const base = normalizeServer(server);
    const previous = this.data.immich;
    const existing = previous && previous.server === base ? secrets.getSecret(previous.secretId) : null;
    const credential = key.trim() || existing;
    if (!credential) throw new Error('Enter an Immich API key.');
    const client = new ImmichClient(base, credential, requestUrl);
    const [, page] = await Promise.all([client.albums(), client.search({ size: 1 })]);
    if (page.items[0]) await client.image(page.items[0].id, 'thumbnail');
    const secretId = previous?.server === base ? previous.secretId : 'media-hub-immich-' + crypto.randomUUID();
    secrets.setSecret(secretId, credential);
    try { await this.store.mutate(data => { data.immich = { server: base, secretId }; }); }
    catch (error) { secrets.setSecret(secretId, existing ?? ''); throw error; }
    if (previous && previous.secretId !== secretId) secrets.setSecret(previous.secretId, '');
    for (const view of this.views()) view.refreshImmich(true);
  }

  async disconnectImmich(): Promise<void> {
    const connection = this.data.immich;
    await this.store.mutate(data => { delete data.immich; });
    if (connection) immichSecrets(this.app)?.setSecret(connection.secretId, '');
    for (const view of this.views()) view.refreshImmich(true);
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
