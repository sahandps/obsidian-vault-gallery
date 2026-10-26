import * as esbuild from 'esbuild';
import { mkdir, copyFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
await mkdir('.preview', { recursive: true });
await copyFile('preview/index.html', '.preview/index.html');
await cp('preview/assets', '.preview/assets', { recursive: true });
const context = await esbuild.context({
  entryPoints: ['preview/main.ts'], bundle: true, format: 'esm', target: 'es2022',
  outfile: '.preview/app.js', alias: { obsidian: resolve('preview/obsidian.ts') },
  logLevel: 'info', sourcemap: true,
});
await context.watch();
const server = await context.serve({ host: '127.0.0.1', port: 4173, servedir: '.preview' });
console.log(`Browser preview: http://127.0.0.1:${server.port}`);
