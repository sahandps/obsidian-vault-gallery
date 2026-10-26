// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only

export type MediaKind = 'image' | 'gif' | 'video' | 'audio' | 'pdf';
export type SortOrder = 'newest' | 'oldest' | 'name' | 'largest';
export interface MediaFile {
  path: string; name: string; extension: string;
  stat: { ctime: number; mtime: number; size: number };
}
export interface MediaMetadata { tags: string[]; description: string }
export interface GalleryData {
  version: 1;
  thumbnailSize: number;
  metadata: Record<string, MediaMetadata>;
}
export interface Filters {
  query: string; kind: MediaKind | 'all'; folder: string | null;
  tag: string; sort: SortOrder;
}
const extensions: Record<MediaKind, Set<string>> = {
  image: new Set(['avif', 'bmp', 'jpeg', 'jpg', 'png', 'svg', 'webp', 'heic', 'heif', 'tif', 'tiff', 'ico']),
  gif: new Set(['gif']),
  video: new Set(['mp4', 'webm', 'mov', 'mkv', 'ogv', 'avi', 'm4v', 'mpg', 'mpeg']),
  audio: new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus', 'aiff', '3gp']),
  pdf: new Set(['pdf']),
};
export function mediaKind(extension: string): MediaKind | undefined {
  const ext = extension.toLowerCase();
  return (Object.keys(extensions) as MediaKind[]).find(kind => extensions[kind].has(ext));
}
export function parseTags(value: string): string[] {
  return [...new Set(value.split(',').map(tag => tag.trim().replace(/^#+/, '').toLowerCase()).filter(Boolean))];
}
export function getMetadata(data: GalleryData, path: string): MediaMetadata {
  return Object.prototype.hasOwnProperty.call(data.metadata, path)
    ? data.metadata[path] : { tags: [], description: '' };
}
export function sanitizeData(raw: unknown): GalleryData {
  const data: GalleryData = { version: 1, thumbnailSize: 220, metadata: Object.create(null) as Record<string, MediaMetadata> };
  if (!raw || typeof raw !== 'object') return data;
  const input = raw as Partial<GalleryData>;
  if (typeof input.thumbnailSize === 'number' && Number.isFinite(input.thumbnailSize)) {
    data.thumbnailSize = Math.min(360, Math.max(140, input.thumbnailSize));
  }
  if (input.metadata && typeof input.metadata === 'object') {
    for (const [path, value] of Object.entries(input.metadata)) {
      if (!value || typeof value !== 'object') continue;
      data.metadata[path] = {
        tags: Array.isArray(value.tags) ? parseTags(value.tags.filter(tag => typeof tag === 'string').join(',')) : [],
        description: typeof value.description === 'string' ? value.description : '',
      };
    }
  }
  return data;
}
export function inFolder(path: string, folder: string | null): boolean {
  return folder === null || (folder === '' ? !path.includes('/') : path.startsWith(`${folder}/`));
}
export function filterMedia<T extends MediaFile>(files: T[], data: GalleryData, filters: Filters): T[] {
  const terms = filters.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return files.filter(file => {
    const kind = mediaKind(file.extension);
    if (!kind || (filters.kind !== 'all' && kind !== filters.kind) || !inFolder(file.path, filters.folder)) return false;
    const meta = getMetadata(data, file.path);
    if (filters.tag && !meta.tags.includes(filters.tag)) return false;
    const haystack = `${file.path} ${meta.tags.join(' ')} ${meta.description}`.toLowerCase();
    return terms.every(term => haystack.includes(term));
  }).sort((a, b) => {
    let result = 0;
    if (filters.sort === 'newest') result = b.stat.mtime - a.stat.mtime;
    if (filters.sort === 'oldest') result = a.stat.mtime - b.stat.mtime;
    if (filters.sort === 'largest') result = b.stat.size - a.stat.size;
    return result || a.name.localeCompare(b.name, undefined, { numeric: true }) || a.path.localeCompare(b.path);
  });
}
export function moveMetadata(data: GalleryData, oldPath: string, newPath: string): void {
  for (const path of Object.keys(data.metadata)) {
    if (path === oldPath || path.startsWith(`${oldPath}/`)) {
      data.metadata[newPath + path.slice(oldPath.length)] = data.metadata[path];
      delete data.metadata[path];
    }
  }
}
export function removeMetadata(data: GalleryData, removedPath: string): void {
  for (const path of Object.keys(data.metadata)) {
    if (path === removedPath || path.startsWith(`${removedPath}/`)) delete data.metadata[path];
  }
}
export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

/** Rename only the filename stem; keep the original folder and extension. */
export function renamedPath(file: Pick<MediaFile, 'path' | 'name' | 'extension'>, input: string): string {
  const name = input.trim();
  if (!name || name === '.' || name === '..') throw new Error('Enter a file name.');
  if (/[\\/:*?"<>|]/.test(name) || [...name].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('The name cannot contain slashes or these characters: : * ? " < > |');
  if (name.endsWith('.')) throw new Error('The name cannot end with a period.');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('This name is reserved by the operating system.');
  const filename = `${name}.${file.extension}`;
  if (new TextEncoder().encode(filename).length > 255) throw new Error('This file name is too long.');
  const slash = file.path.lastIndexOf('/');
  return `${slash < 0 ? '' : file.path.slice(0, slash + 1)}${filename}`;
}
