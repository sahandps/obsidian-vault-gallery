import { mkdir, copyFile, readFile, rm } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const target = `release/${manifest.id}`;
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of ['main.js', 'styles.css', 'manifest.json', 'README.md']) {
  await copyFile(file, `${target}/${file}`);
}
console.log(`Installable plugin created in ${target}`);
