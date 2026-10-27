// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only

const DATABASE_NAME = 'media-hub-thumbnails';
const STORE_NAME = 'thumbnails';

interface StoredThumbnail { path: string; signature: string; blob: Blob }

/**
 * Keeps generated thumbnails on this device in IndexedDB, one entry per file path.
 * Every method is safe to call when IndexedDB is missing or fails: it simply behaves as an empty cache.
 */
export class ThumbnailCache {
  private database: Promise<IDBDatabase | null> | null = null;

  constructor(private factory: IDBFactory | undefined) {}

  get available(): boolean { return this.factory !== undefined; }

  async get(path: string, signature: string): Promise<Blob | undefined> {
    const stored = await this.run<StoredThumbnail | undefined>('readonly', store => store.get(path) as IDBRequest<StoredThumbnail | undefined>);
    return stored && stored.signature === signature ? stored.blob : undefined;
  }

  async put(path: string, signature: string, blob: Blob): Promise<void> {
    await this.run('readwrite', store => store.put({ path, signature, blob } satisfies StoredThumbnail));
  }

  async forget(path: string): Promise<void> {
    await this.run('readwrite', store => store.delete(path));
  }

  private open(): Promise<IDBDatabase | null> {
    if (!this.factory) return Promise.resolve(null);
    this.database ??= new Promise(resolve => {
      const request = this.factory!.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'path' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return this.database;
  }

  private async run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
    const database = await this.open();
    if (!database) return undefined;
    return new Promise(resolve => {
      try {
        const request = action(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
  }
}
