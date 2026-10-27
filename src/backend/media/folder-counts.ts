// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only

/** Counts files per folder, including every parent folder. The empty string is the vault root. */
export function countFilesByFolder(files: readonly { path: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const parts = file.path.split('/');
    parts.pop();
    if (parts.length === 0) counts.set('', (counts.get('') ?? 0) + 1);
    for (let index = 1; index <= parts.length; index++) {
      const path = parts.slice(0, index).join('/');
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return counts;
}
