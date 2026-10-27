// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { App, TFile } from 'obsidian';
import type { GalleryData } from '../data/gallery-data';
import { removeMetadata } from '../data/metadata';

export interface TrashTarget { file: TFile; path: string }
export interface TrashResult { deleted: string[]; failed: string[] }

/** Moves files to Obsidian's trash and forgets their tags and collection membership. */
export class MediaTrasher {
  constructor(private app: App, private data: () => GalleryData) {}

  async trash(targets: readonly TrashTarget[]): Promise<TrashResult> {
    const result: TrashResult = { deleted: [], failed: [] };
    for (const target of targets) {
      // A confirmation applies to these exact files, not replacements or renamed files.
      if (target.file.path !== target.path || !this.app.vault.getFiles().includes(target.file)) { result.failed.push(target.path); continue; }
      try {
        await this.app.fileManager.trashFile(target.file);
        removeMetadata(this.data(), target.path);
        result.deleted.push(target.path);
      } catch (error) {
        console.error('Media Hub could not move a file to trash', error);
        result.failed.push(target.path);
      }
    }
    return result;
  }
}
