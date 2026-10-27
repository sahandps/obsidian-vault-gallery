// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { GalleryData, MediaMetadata } from './gallery-data';

/** Splits comma-separated text into unique, lowercase tags without leading hashes. */
export function parseTags(value: string): string[] {
  return [...new Set(value.split(',').map(tag => tag.trim().replace(/^#+/, '').toLowerCase()).filter(Boolean))];
}

export function getMetadata(data: GalleryData, path: string): MediaMetadata {
  return Object.prototype.hasOwnProperty.call(data.metadata, path)
    ? data.metadata[path] : { tags: [], description: '' };
}

function isInside(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`);
}

/** Moves tags and collection membership when a file or folder is renamed. */
export function moveMetadata(data: GalleryData, oldPath: string, newPath: string): void {
  for (const collection of data.collections) {
    collection.paths = [...new Set(collection.paths.map(path => isInside(path, oldPath) ? newPath + path.slice(oldPath.length) : path))];
  }
  for (const path of Object.keys(data.metadata)) {
    if (isInside(path, oldPath)) {
      data.metadata[newPath + path.slice(oldPath.length)] = data.metadata[path];
      delete data.metadata[path];
    }
  }
}

/** Forgets tags and collection membership for a deleted file or folder. */
export function removeMetadata(data: GalleryData, removedPath: string): void {
  for (const collection of data.collections) collection.paths = collection.paths.filter(path => !isInside(path, removedPath));
  for (const path of Object.keys(data.metadata)) {
    if (isInside(path, removedPath)) delete data.metadata[path];
  }
}
