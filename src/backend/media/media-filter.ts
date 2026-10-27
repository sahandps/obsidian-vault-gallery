// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { GalleryData, SortOrder } from '../data/gallery-data';
import { getMetadata } from '../data/metadata';
import { mediaKind, type MediaKind } from './media-kinds';

export interface MediaFile {
  path: string; name: string; extension: string;
  stat: { ctime: number; mtime: number; size: number };
}
export interface Filters {
  query: string; kind: MediaKind | 'all'; folder: string | null;
  tag: string; sort: SortOrder; collection?: string | null;
}

/** True when the path sits under the folder. An empty folder means the vault root only. */
export function inFolder(path: string, folder: string | null): boolean {
  return folder === null || (folder === '' ? !path.includes('/') : path.startsWith(`${folder}/`));
}

/** Applies every filter, then sorts. Every search word must match the path, tags or description. */
export function filterMedia<T extends MediaFile>(files: T[], data: GalleryData, filters: Filters): T[] {
  const terms = filters.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const collection = filters.collection ? data.collections.find(item => item.id === filters.collection) : null;
  const members = collection ? new Set(collection.paths) : null;
  return files.filter(file => {
    if (filters.collection && (!members || !members.has(file.path))) return false;
    const kind = mediaKind(file.extension);
    if (!kind || (filters.kind !== 'all' && kind !== filters.kind) || !inFolder(file.path, filters.folder)) return false;
    const meta = getMetadata(data, file.path);
    if (filters.tag && !meta.tags.includes(filters.tag)) return false;
    const haystack = `${file.path} ${meta.tags.join(' ')} ${meta.description}`.toLowerCase();
    return terms.every(term => haystack.includes(term));
  }).sort((a, b) => compareFiles(a, b, filters.sort));
}

function compareFiles(a: MediaFile, b: MediaFile, sort: SortOrder): number {
  let result = 0;
  if (sort === 'newest') result = b.stat.mtime - a.stat.mtime;
  if (sort === 'oldest') result = a.stat.mtime - b.stat.mtime;
  if (sort === 'largest') result = b.stat.size - a.stat.size;
  return result || a.name.localeCompare(b.name, undefined, { numeric: true }) || a.path.localeCompare(b.path);
}
