// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { TFolder, type App } from 'obsidian';
import { importPath, normalizeImportFolder } from '../media/file-names';

export interface ImportResult { paths: string[]; failed: string[] }

/** Copies files chosen by the user into the vault without overwriting anything. */
export class MediaImporter {
  constructor(private app: App, private importFolder: () => string) {}

  async importFiles(files: readonly File[], progress: (message: string) => void): Promise<ImportResult> {
    const folder = normalizeImportFolder(this.importFolder());
    const result: ImportResult = { paths: [], failed: [] };
    for (const [index, file] of files.entries()) {
      progress(`Importing ${index + 1} of ${files.length}…`);
      try {
        // Validate the file before creating any folders or reading its bytes.
        importPath(folder, file.name);
        await this.ensureFolder(folder);
        result.paths.push(await this.saveFile(folder, file));
      } catch (error) {
        console.error('Media Hub import failed', file.name, error);
        result.failed.push(file.name);
      }
    }
    return result;
  }

  /** Makes parent folders lazily and never races another writer. */
  private async ensureFolder(folder: string): Promise<void> {
    const vault = this.app.vault;
    let path = '';
    for (const part of folder.split('/').filter(Boolean)) {
      path = path ? `${path}/${part}` : part;
      const existing = vault.getAbstractFileByPath(path);
      if (existing && !(existing instanceof TFolder)) throw new Error(`A file blocks the folder: ${path}`);
      if (existing) continue;
      try { await vault.createFolder(path); }
      catch (error) { if (!(vault.getAbstractFileByPath(path) instanceof TFolder)) throw error; }
    }
  }

  private async saveFile(folder: string, file: File): Promise<string> {
    const vault = this.app.vault;
    const bytes = await file.arrayBuffer();
    for (let suffix = 0; suffix < 10000; suffix++) {
      const path = importPath(folder, file.name, suffix);
      if (vault.getAbstractFileByPath(path)) continue;
      try {
        await vault.createBinary(path, bytes);
        return path;
      } catch (error) {
        if (!vault.getAbstractFileByPath(path)) throw error;
      }
    }
    throw new Error('Could not find an available file name.');
  }
}
