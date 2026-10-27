// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
export interface AndroidFilesystem {
  mkdir(options: { path: string; directory: string; recursive: boolean }): Promise<unknown>;
  writeFile(options: { path: string; directory: string; data: string }): Promise<unknown>;
  appendFile(options: { path: string; directory: string; data: string }): Promise<unknown>;
  stat?(options: { path: string; directory: string }): Promise<{ size: number }>;
  checkPermissions?(): Promise<{ publicStorage: string }>;
  requestPermissions?(): Promise<{ publicStorage: string }>;
}
export function androidFilesystem(owner: Window): AndroidFilesystem | undefined {
  const host = owner as Window & { Capacitor?: { Plugins?: { Filesystem?: AndroidFilesystem }; nativePromise?: (plugin: string, method: string, options: unknown) => Promise<unknown> } };
  const cap = host.Capacitor;
  const fs = cap?.Plugins?.Filesystem;
  if (fs && typeof fs.writeFile === 'function' && typeof fs.appendFile === 'function' && typeof fs.mkdir === 'function') return fs;
  // Some Obsidian builds expose the native bridge without global plugin proxies.
  if (typeof cap?.nativePromise !== 'function') return undefined;
  const call = (method: string, options: unknown) => cap.nativePromise!('Filesystem', method, options);
  return { mkdir: options => call('mkdir', options), writeFile: options => call('writeFile', options), appendFile: options => call('appendFile', options), stat: options => call('stat', options) as Promise<{ size: number }>, checkPermissions: () => call('checkPermissions', {}) as Promise<{ publicStorage: string }>, requestPermissions: () => call('requestPermissions', {}) as Promise<{ publicStorage: string }> };
}
async function timed<T>(operation: Promise<T>): Promise<T> {
  let timer: number | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error('Android did not respond within 30 seconds. Check storage permission and try again.')), 30000); })]); }
  finally { if (timer !== undefined) window.clearTimeout(timer); }
}
export async function saveAndroidFiles(fs: AndroidFilesystem, files: readonly { path: string; read: () => Promise<ArrayBuffer> }[], progress: (message: string) => void = () => {}): Promise<{ folder: string; saved: string[]; failed: string[] }> {
  if (!files.length) throw new Error('Select at least one file.');
  progress('Checking storage permission…');
  if (fs.checkPermissions && fs.requestPermissions) {
    const permission = await timed(fs.checkPermissions());
    if (permission.publicStorage !== 'granted') {
      const result = await timed(fs.requestPermissions());
      if (result.publicStorage !== 'granted') throw new Error('Storage permission is needed to save to Documents.');
    }
  }
  const folder = `Media Hub/${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 10)}`;
  progress('Creating download folder…');
  await timed(fs.mkdir({ path: folder, directory: 'DOCUMENTS', recursive: true }));
  const names = new Set<string>();
  const saved: string[] = [], failed: string[] = [];
  for (const [index, file] of files.entries()) {
    const original = file.path.split('/').pop()!;
    let name = original, suffix = 1;
    const dot = original.lastIndexOf('.');
    while (names.has(name.toLowerCase())) name = `${dot < 0 ? original : original.slice(0, dot)} (${suffix++})${dot < 0 ? '' : original.slice(dot)}`;
    names.add(name.toLowerCase());
    try {
      progress(`Saving ${index + 1} of ${files.length}: ${original}`);
      const bytes = new Uint8Array(await timed(file.read()));
      const path = `${folder}/${name}`;
      // Read through the vault API: Android vaults can use content URIs, not ordinary paths.
      for (let offset = 0; offset < Math.max(1, bytes.length); offset += 524288) {
        const chunk = bytes.subarray(offset, offset + 524288);
        let binary = '';
        for (let i = 0; i < chunk.length; i += 8192) binary += String.fromCharCode(...chunk.subarray(i, i + 8192));
        const options = { path, directory: 'DOCUMENTS', data: btoa(binary) };
        await timed(offset === 0 ? fs.writeFile(options) : fs.appendFile(options));
      }
      if (fs.stat) {
        const info = await timed(fs.stat({ path, directory: 'DOCUMENTS' }));
        if (info.size !== bytes.length) throw new Error('Saved file size does not match the original.');
      }
      saved.push(file.path);
    } catch (error) { failed.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return { folder, saved, failed };
}
