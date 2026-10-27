// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { mediaKind } from './media-kinds';
import type { MediaFile } from './media-filter';

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

/** Destination path for an imported file; `suffix` adds " (n)" to avoid overwriting. */
export function importPath(folder: string, name: string, suffix = 0): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || !mediaKind(name.slice(dot + 1))) throw new Error('Choose a supported media file.');
  const stem = name.slice(0, dot);
  const extension = name.slice(dot + 1);
  const filename = renamedPath({ path: name, name, extension }, suffix ? `${stem} (${suffix})` : stem);
  return folder ? `${folder}/${filename}` : filename;
}
