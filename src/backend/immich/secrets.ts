// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { requireApiVersion, type App } from 'obsidian';

interface ImmichSecrets {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
}

/** Keep the local gallery compatible with older Obsidian versions. */
export function immichSecrets(app: App): ImmichSecrets | undefined {
  return requireApiVersion('1.11.4') ? app.secretStorage : undefined;
}
