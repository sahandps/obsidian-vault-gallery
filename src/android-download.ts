// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
/** Obsidian already registers Capacitor's native Filesystem plugin on Android. */
export interface AndroidFilesystem {
  mkdir(options: { path: string; directory: string; recursive: boolean }): Promise<unknown>;
  copy(options: { from: string; to: string; toDirectory: string }): Promise<unknown>;
  checkPermissions?(): Promise<{ publicStorage: string }>;
  requestPermissions?(): Promise<{ publicStorage: string }>;
}
export function androidFilesystem(owner: Window): AndroidFilesystem | undefined {
  const host = owner as Window & { Capacitor?: { Plugins?: { Filesystem?: AndroidFilesystem } } };
  const fs = host.Capacitor?.Plugins?.Filesystem;
  return fs && typeof fs.copy === 'function' && typeof fs.mkdir === 'function' ? fs : undefined;
}
export async function saveAndroidFiles(fs: AndroidFilesystem, files: readonly { path: string; source: string }[]): Promise<{ folder: string; saved: string[]; failed: string[] }> {
  if (!files.length) throw new Error('Select at least one file.');
  if (fs.checkPermissions && fs.requestPermissions) {
    const permission = await fs.checkPermissions();
    if (permission.publicStorage !== 'granted') {
      const result = await fs.requestPermissions();
      if (result.publicStorage !== 'granted') throw new Error('Storage permission is needed to save to Documents.');
    }
  }
  // A new export folder prevents overwriting device files or vault originals.
  const folder = `Media Hub/${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 10)}`;
  await fs.mkdir({ path: folder, directory: 'DOCUMENTS', recursive: true });
  const names = new Set<string>();
  const saved: string[] = [], failed: string[] = [];
  for (const file of files) {
    const original = file.path.split('/').pop()!;
    let name = original, suffix = 1;
    const dot = original.lastIndexOf('.');
    while (names.has(name.toLowerCase())) name = `${dot < 0 ? original : original.slice(0, dot)} (${suffix++})${dot < 0 ? '' : original.slice(dot)}`;
    names.add(name.toLowerCase());
    try {
      await fs.copy({ from: file.source, to: `${folder}/${name}`, toDirectory: 'DOCUMENTS' });
      saved.push(file.path);
    } catch { failed.push(file.path); }
  }
  return { folder, saved, failed };
}
