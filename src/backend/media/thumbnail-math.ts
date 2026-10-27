// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only

/** Longest side, in pixels, of a generated thumbnail. */
export const THUMBNAIL_EDGE = 480;

const DECODABLE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp']);

/** Only formats every webview can decode into a bitmap get a generated thumbnail. */
export function canThumbnail(extension: string): boolean {
  return DECODABLE_EXTENSIONS.has(extension.toLowerCase());
}

/** Scales a size down so its longest side fits the edge. Returns null when it is already small enough. */
export function fitWithin(width: number, height: number, edge: number): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const longest = Math.max(width, height);
  if (longest <= edge) return null;
  const scale = edge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Changes whenever the file's content or the thumbnail size changes, so stale thumbnails are never reused. */
export function thumbnailSignature(file: { stat: { mtime: number; size: number } }, edge: number): string {
  return `${file.stat.mtime}-${file.stat.size}-${edge}`;
}
