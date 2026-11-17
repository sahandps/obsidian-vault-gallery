// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { assetLink, isAssetId, normalizeServer, type ImmichAsset } from './client';

export interface ImmichReference { server: string; id: string }
export const IMMICH_BLOCK = 'immich';

export function parseReference(source: string): ImmichReference {
  const parsed: unknown = JSON.parse(source) as unknown;
  if (parsed === null || typeof parsed !== 'object' || !('server' in parsed) || typeof parsed.server !== 'string' || !('id' in parsed) || !isAssetId(parsed.id)) {
    throw new Error('Invalid Immich reference.');
  }
  return { server: normalizeServer(parsed.server), id: parsed.id };
}

export function referenceMarkdown(server: string, assets: readonly ImmichAsset[], format: 'embed' | 'link'): string {
  const base = normalizeServer(server);
  const fence = String.fromCharCode(96).repeat(3);
  return assets.map(({ id, name }) => {
    const link = assetLink(base, id);
    if (format === 'embed') return fence + IMMICH_BLOCK + '\n' + JSON.stringify({ server: base, id }) + '\n' + fence;
    const label = name.replace(/[\r\n]+/g, ' ').replace(/[\\`*_[\]<>!&]/g, '\\$&');
    return '[' + label + '](<' + link + '>)';
  }).join('\n\n');
}
