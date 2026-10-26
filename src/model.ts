// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only

export type MediaKind = 'image' | 'gif' | 'video' | 'audio' | 'pdf';
export type SortOrder = 'newest' | 'oldest' | 'name' | 'largest';
export interface MediaFile {
  path: string; name: string; extension: string;
  stat: { ctime: number; mtime: number; size: number };
}
export interface MediaMetadata { tags: string[]; description: string }
export interface MediaCollection { id: string; name: string; paths: string[] }
export interface GalleryData {
  version: 1;
  thumbnailSize: number;
  importFolder: string;
  sidebarCollapsed: boolean;
  metadata: Record<string, MediaMetadata>;
  collections: MediaCollection[];
}
export interface Filters {
  query: string; kind: MediaKind | 'all'; folder: string | null;
  tag: string; sort: SortOrder; collection?: string | null;
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
  const data: GalleryData = { version: 1, thumbnailSize: 220, importFolder: 'Media', sidebarCollapsed: false, collections: [], metadata: Object.create(null) as Record<string, MediaMetadata> };
  if (!raw || typeof raw !== 'object') return data;
  const input = raw as Partial<GalleryData>;
  if (typeof input.thumbnailSize === 'number' && Number.isFinite(input.thumbnailSize)) {
    data.thumbnailSize = Math.min(360, Math.max(140, input.thumbnailSize));
  }
  if (typeof input.sidebarCollapsed === 'boolean') data.sidebarCollapsed = input.sidebarCollapsed;
  if (typeof input.importFolder === 'string') {
    try { data.importFolder = normalizeImportFolder(input.importFolder); } catch { /* Keep the safe default for older or malformed settings. */ }
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
  if (Array.isArray(input.collections)) {
    const ids = new Set<string>();
    for (const value of input.collections) {
      if (!value || typeof value.id !== 'string' || !value.id || ids.has(value.id) || typeof value.name !== 'string' || !value.name.trim()) continue;
      ids.add(value.id);
      data.collections.push({ id: value.id, name: value.name.trim(), paths: Array.isArray(value.paths) ? [...new Set(value.paths.filter(path => typeof path === 'string'))] : [] });
    }
  }
  return data;
}
export function inFolder(path: string, folder: string | null): boolean {
  return folder === null || (folder === '' ? !path.includes('/') : path.startsWith(`${folder}/`));
}
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
  }).sort((a, b) => {
    let result = 0;
    if (filters.sort === 'newest') result = b.stat.mtime - a.stat.mtime;
    if (filters.sort === 'oldest') result = a.stat.mtime - b.stat.mtime;
    if (filters.sort === 'largest') result = b.stat.size - a.stat.size;
    return result || a.name.localeCompare(b.name, undefined, { numeric: true }) || a.path.localeCompare(b.path);
  });
}
export function moveMetadata(data: GalleryData, oldPath: string, newPath: string): void {
  for (const collection of data.collections) {
    collection.paths = [...new Set(collection.paths.map(path => path === oldPath || path.startsWith(`${oldPath}/`) ? newPath + path.slice(oldPath.length) : path))];
  }
  for (const path of Object.keys(data.metadata)) {
    if (path === oldPath || path.startsWith(`${oldPath}/`)) {
      data.metadata[newPath + path.slice(oldPath.length)] = data.metadata[path];
      delete data.metadata[path];
    }
  }
}
export function removeMetadata(data: GalleryData, removedPath: string): void {
  for (const collection of data.collections) collection.paths = collection.paths.filter(path => path !== removedPath && !path.startsWith(`${removedPath}/`));
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

/** Store only paths relative to this vault; an empty path means its root. */
export function normalizeImportFolder(value: string): string {
  const folder = value.trim().replace(/\\/g, '/');
  if (!folder) return '';
  if (folder.startsWith('/') || /^[a-z]:/i.test(folder)) throw new Error('Choose a folder inside this vault.');
  const parts = folder.split('/').filter(Boolean);
  for (const part of parts) {
    if (part === '.' || part === '..' || part.startsWith('.')) throw new Error('Use a visible folder inside this vault.');
    renamedPath({ path: 'file.bin', name: 'file.bin', extension: 'bin' }, part);
  }
  return parts.join('/');
}
export function mediaAccept(): string {
  return [...new Set(Object.values(extensions).flatMap(values => [...values]))].map(ext => `.${ext}`).join(',');
}
export function importPath(folder: string, name: string, suffix = 0): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || !mediaKind(name.slice(dot + 1))) throw new Error('Choose a supported media file.');
  const stem = name.slice(0, dot);
  const extension = name.slice(dot + 1);
  const filename = renamedPath({ path: name, name, extension }, suffix ? `${stem} (${suffix})` : stem);
  return folder ? `${folder}/${filename}` : filename;
}

export function createCollection(data: GalleryData, name: string, paths: readonly string[] = []): MediaCollection {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a collection name.');
  if (data.collections.some(item => item.name.toLowerCase() === trimmed.toLowerCase())) throw new Error('A collection with this name already exists.');
  const collection = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, name: trimmed, paths: [...new Set(paths)] };
  data.collections.push(collection);
  return collection;
}
