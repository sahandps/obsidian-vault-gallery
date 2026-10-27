// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { App, TFile } from 'obsidian';
import { THUMBNAIL_EDGE, canThumbnail, fitWithin, thumbnailSignature } from '../media/thumbnail-math';
import type { ThumbnailCache } from './thumbnail-cache';

const MAX_PARALLEL = 3;

/** Makes small cached copies of large images so the grid scrolls smoothly. */
export class ThumbnailService {
  private urls = new Map<string, string>();
  private pending = new Map<string, Promise<string | null>>();
  private failed = new Set<string>();
  private waiting: (() => void)[] = [];
  private running = 0;

  constructor(private app: App, private cache: ThumbnailCache, private edge = THUMBNAIL_EDGE) {}

  /** False when this device or file type cannot produce a thumbnail, so callers should use the original. */
  isSupported(file: TFile): boolean {
    return canThumbnail(file.extension) && typeof createImageBitmap === 'function' && typeof URL.createObjectURL === 'function';
  }

  /**
   * Resolves to a URL for a small copy of the image, or null when the original should be used.
   * `isNeeded` lets a queued request be skipped after its card has scrolled away or been removed.
   */
  get(file: TFile, isNeeded: () => boolean = () => true): Promise<string | null> {
    const signature = thumbnailSignature(file, this.edge);
    const key = `${file.path}|${signature}`;
    const ready = this.urls.get(key);
    if (ready) return Promise.resolve(ready);
    if (this.failed.has(key)) return Promise.resolve(null);
    let job = this.pending.get(key);
    if (!job) {
      job = this.schedule(() => this.load(file, signature, key, isNeeded)).finally(() => this.pending.delete(key));
      this.pending.set(key, job);
    }
    return job;
  }

  forget(path: string): void { void this.cache.forget(path); }

  dispose(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear(); this.waiting = [];
  }

  private async load(file: TFile, signature: string, key: string, isNeeded: () => boolean): Promise<string | null> {
    if (!isNeeded()) return null;
    try {
      const blob = (await this.cache.get(file.path, signature)) ?? (await this.generate(file, signature));
      if (!blob) { this.failed.add(key); return null; }
      const url = URL.createObjectURL(blob);
      this.urls.set(key, url);
      return url;
    } catch (error) {
      console.error('Media Hub could not make a thumbnail', file.path, error);
      this.failed.add(key);
      return null;
    }
  }

  /** Decodes, shrinks and stores the image. Returns null when the original is already small. */
  private async generate(file: TFile, signature: string): Promise<Blob | null> {
    const bitmap = await createImageBitmap(new Blob([await this.app.vault.readBinary(file)]));
    try {
      const size = fitWithin(bitmap.width, bitmap.height, this.edge);
      if (!size) return null;
      const canvas = createEl('canvas');
      canvas.width = size.width; canvas.height = size.height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (blob) void this.cache.put(file.path, signature, blob);
      return blob;
    } finally { bitmap.close(); }
  }

  /** Runs at most a few jobs at once, oldest request first. */
  private schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.running++;
        task().then(resolve, reject).finally(() => { this.running--; this.waiting.shift()?.(); });
      };
      if (this.running < MAX_PARALLEL) start(); else this.waiting.push(start);
    });
  }
}
