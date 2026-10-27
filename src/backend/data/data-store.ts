// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { sanitizeData, type GalleryData } from './gallery-data';

/** Holds the gallery data in memory and writes it to disk one save at a time. */
export class DataStore {
  data: GalleryData = sanitizeData(null);
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(private write: (data: GalleryData) => Promise<void>) {}

  load(raw: unknown): void { this.data = sanitizeData(raw); }

  /** Snapshots every write and serializes them, so a slow older write cannot replace newer tags. */
  persist(): Promise<void> {
    const snapshot = sanitizeData(this.data);
    const write = this.saveQueue.catch(() => undefined).then(() => this.write(snapshot));
    this.saveQueue = write;
    return write;
  }

  /** Applies a change and saves it. If saving fails, the change is rolled back and the error rethrown. */
  async mutate(change: (data: GalleryData) => void): Promise<void> {
    const previous = sanitizeData(this.data);
    change(this.data);
    const next = sanitizeData(this.data);
    try { await this.persist(); }
    catch (error) { this.rollback(previous, next); throw error; }
  }

  /** Restores changed fields only if another operation has not since changed them. */
  private rollback(previous: GalleryData, next: GalleryData): void {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    for (const path of new Set([...Object.keys(previous.metadata), ...Object.keys(next.metadata)])) {
      if (same(previous.metadata[path], next.metadata[path])) continue;
      if (!same(this.data.metadata[path], next.metadata[path])) continue;
      if (Object.prototype.hasOwnProperty.call(previous.metadata, path)) this.data.metadata[path] = previous.metadata[path];
      else delete this.data.metadata[path];
    }
    if (same(this.data.collections, next.collections)) this.data.collections = previous.collections;
  }
}
