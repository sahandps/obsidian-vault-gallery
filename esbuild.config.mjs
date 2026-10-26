import * as esbuild from 'esbuild';
const context = await esbuild.context({
  entryPoints: ['src/main.ts'], bundle: true, external: ['obsidian'],
  format: 'cjs', target: 'es2020', outfile: 'main.js',
  sourcemap: process.argv.includes('--watch') ? 'inline' : false,
  minify: !process.argv.includes('--watch'), logLevel: 'info',
});
if (process.argv.includes('--watch')) await context.watch();
else { await context.rebuild(); await context.dispose(); }
