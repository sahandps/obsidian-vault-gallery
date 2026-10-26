import * as esbuild from 'esbuild';
const context = await esbuild.context({
  banner: { js: '/*! Media Hub | Copyright (C) 2026 Sahand (sahandps) | SPDX-License-Identifier: GPL-3.0-only\n * Free software under GNU GPL version 3. Distributed WITHOUT ANY WARRANTY.\n * License: https://www.gnu.org/licenses/gpl-3.0.html\n * Corresponding source: https://github.com/sahandps/obsidian-vault-gallery */' },
  entryPoints: ['src/main.ts'], bundle: true, external: ['obsidian'],
  format: 'cjs', target: 'es2020', outfile: 'main.js',
  sourcemap: process.argv.includes('--watch') ? 'inline' : false,
  minify: !process.argv.includes('--watch'), logLevel: 'info',
});
if (process.argv.includes('--watch')) await context.watch();
else { await context.rebuild(); await context.dispose(); }
