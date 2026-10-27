// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
export interface ExportEntry { path: string; bytes: ArrayBuffer }
export const EXPORT_LIMIT = 512 * 1024 * 1024;
export function exportPayload(entries: readonly ExportEntry[]): File[] {
  if (!entries.length) throw new Error('Select at least one file.');
  if (entries.reduce((size, entry) => size + entry.bytes.byteLength, 0) > EXPORT_LIMIT) throw new Error('Select fewer files: exports are limited to 512 MB.');
  return entries.map(entry => new File([entry.bytes], entry.path.split('/').pop()!, { type: mediaMime(entry.path) }));
}
function mediaMime(path: string): string {
  const types: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', heic: 'image/heic', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', pdf: 'application/pdf' };
  return types[path.split('.').pop()?.toLowerCase() || ''] || 'application/octet-stream';
}
