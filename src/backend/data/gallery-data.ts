// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { normalizeImportFolder } from '../media/file-names';
import { parseTags } from './metadata';

export type SortOrder = 'newest' | 'oldest' | 'name' | 'largest';
export interface MediaMetadata { tags: string[]; description: string }
export interface MediaCollection { id: string; name: string; paths: string[] }
export interface GalleryData {
  version: 1;
  thumbnailSize: number;
  importFolder: string;
  sidebarCollapsed: boolean;
  thumbnailFit: 'cover' | 'contain';
  compact: boolean;
  showFilenames: boolean;
  showSubtitles: boolean;
  videoThumbnails: boolean;
  defaultSort: SortOrder;
  metadata: Record<string, MediaMetadata>;
  collections: MediaCollection[];
}

const SORT_ORDERS: readonly string[] = ['newest', 'oldest', 'name', 'largest'];

function defaultData(): GalleryData {
  return {
    version: 1, thumbnailSize: 220, importFolder: 'Media', sidebarCollapsed: false, thumbnailFit: 'cover',
    compact: false, showFilenames: true, showSubtitles: true, videoThumbnails: true, defaultSort: 'newest',
    collections: [], metadata: Object.create(null) as Record<string, MediaMetadata>,
  };
}

/** Builds valid gallery data from anything read from disk, dropping what is malformed. */
export function sanitizeData(raw: unknown): GalleryData {
  const data = defaultData();
  if (!raw || typeof raw !== 'object') return data;
  const input = raw as Partial<GalleryData>;
  if (typeof input.thumbnailSize === 'number' && Number.isFinite(input.thumbnailSize)) {
    data.thumbnailSize = Math.min(360, Math.max(140, input.thumbnailSize));
  }
  if (input.thumbnailFit === 'contain') data.thumbnailFit = 'contain';
  for (const key of ['compact', 'showFilenames', 'showSubtitles', 'videoThumbnails'] as const) if (typeof input[key] === 'boolean') data[key] = input[key];
  if (SORT_ORDERS.includes(input.defaultSort || '')) data.defaultSort = input.defaultSort!;
  if (typeof input.sidebarCollapsed === 'boolean') data.sidebarCollapsed = input.sidebarCollapsed;
  if (typeof input.importFolder === 'string') {
    try { data.importFolder = normalizeImportFolder(input.importFolder); } catch { /* Keep the safe default for older or malformed settings. */ }
  }
  copyMetadata(input, data);
  copyCollections(input, data);
  return data;
}

function copyMetadata(input: Partial<GalleryData>, data: GalleryData): void {
  if (!input.metadata || typeof input.metadata !== 'object') return;
  for (const [path, value] of Object.entries(input.metadata)) {
    if (!value || typeof value !== 'object') continue;
    data.metadata[path] = {
      tags: Array.isArray(value.tags) ? parseTags(value.tags.filter(tag => typeof tag === 'string').join(',')) : [],
      description: typeof value.description === 'string' ? value.description : '',
    };
  }
}

function copyCollections(input: Partial<GalleryData>, data: GalleryData): void {
  if (!Array.isArray(input.collections)) return;
  const ids = new Set<string>();
  for (const value of input.collections) {
    if (!value || typeof value.id !== 'string' || !value.id || ids.has(value.id) || typeof value.name !== 'string' || !value.name.trim()) continue;
    ids.add(value.id);
    data.collections.push({ id: value.id, name: value.name.trim(), paths: Array.isArray(value.paths) ? [...new Set(value.paths.filter(path => typeof path === 'string'))] : [] });
  }
}
