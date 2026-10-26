import './theme.css';
import '../styles.css';
import MediaHubPlugin from '../src/main';
import { TFolder } from './obsidian';

interface PreviewFile {
  path: string; name: string; extension: string; parent: { path: string };
  stat: { ctime: number; mtime: number; size: number }; url: string;
}
const files: PreviewFile[] = [];
const now = Date.now();
function addFile(path: string, url: string, size: number, age = 0): PreviewFile {
  const parts = path.split('/');
  const name = parts.pop()!;
  const file = { path, name, extension: name.split('.').pop()!, parent: { path: parts.join('/') || '/' }, stat: { ctime: now - (age + 12) * 86400000, mtime: now - age * 86400000, size }, url };
  files.push(file); return file;
}
for (const [index, [folder, name]] of [
  ['Landscapes', 'Alpine morning'], ['Landscapes', 'Desert light'], ['Inspiration', 'Quiet geometry'],
  ['Landscapes', 'Coastal afternoon'], ['Inspiration', 'Botanical study'], ['Landscapes', 'Evening dunes'],
  ['Inspiration', 'Warm balance'], ['Landscapes/Forest', 'Green horizon'], ['Inspiration', 'Blue hour'],
].entries()) addFile(`${folder}/${name}.svg`, `/assets/art-${index}.svg`, 1600 + index * 130, index);
addFile('Motion/Orbit.gif', '/assets/orbit.gif', 142400, 2);
addFile('Audio/Soft chimes.wav', '/assets/chimes.wav', 352844, 5);
addFile('Documents/Gallery notes.pdf', '/assets/notes.pdf', 720, 9);

// The adapter uses the production GalleryView; only Obsidian's vault and storage are simulated.
const leaf: any = { contentEl: document.getElementById('gallery') };
const plugin: any = new MediaHubPlugin();
const listeners = new Map<string, (...args: any[]) => void>();
const folders = new Map<string, TFolder>();
for (const file of files) {
  const parts = file.path.split('/'); parts.pop();
  for (let i = 1; i <= parts.length; i++) { const path = parts.slice(0, i).join('/'); folders.set(path, new TFolder(path)); }
}
const app: any = {
  doc: document,
  vault: {
    getFiles: () => files,
    getResourcePath: (file: PreviewFile) => file.url,
    getAbstractFileByPath: (path: string) => files.find(file => file.path === path) || folders.get(path) || null,
    getAllLoadedFiles: () => [...files, ...folders.values()],
    createFolder: async (path: string) => { const folder = new TFolder(path); folders.set(path, folder); return folder; },
    createBinary: async (path: string, bytes: ArrayBuffer) => {
      if (files.some(file => file.path === path)) throw new Error('File already exists.');
      const extension = path.split('.').pop()!.toLowerCase();
      const mime: Record<string, string> = { svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', pdf: 'application/pdf' };
      const blob = new Blob([bytes], { type: mime[extension] || 'application/octet-stream' });
      const file = addFile(path, URL.createObjectURL(blob), bytes.byteLength);
      listeners.get('create')?.(file); return file;
    },
    on: (name: string, callback: (...args: any[]) => void) => { listeners.set(name, callback); return {}; },
  },
  fileManager: {
    trashFile: async (file: PreviewFile) => {
      const index = files.indexOf(file); if (index < 0) throw new Error('File not found.');
      files.splice(index, 1); listeners.get('delete')?.(file);
    },
    renameFile: async (file: PreviewFile, newPath: string) => {
      if (files.some(item => item.path === newPath)) throw new Error('A file with this name already exists.');
      const oldPath = file.path;
      file.path = newPath; file.name = newPath.split('/').pop()!;
      listeners.get('rename')?.(file, oldPath);
    },
  },
  workspace: {
    getLeavesOfType: () => [leaf],
    getLeaf: () => ({ openFile: async (file: PreviewFile) => { window.open(file.url, '_blank', 'noopener,noreferrer'); } }),
  },
};
leaf.app = app; plugin.app = app;
await plugin.onload();
if (!localStorage.getItem('vault-gallery-preview')) {
  const seeded: Record<string, string[]> = {
    'Landscapes/Alpine morning.svg': ['nature', 'travel'],
    'Landscapes/Desert light.svg': ['travel', 'warm'],
    'Inspiration/Quiet geometry.svg': ['design', 'minimal'],
    'Inspiration/Botanical study.svg': ['nature', 'design'],
    'Motion/Orbit.gif': ['motion', 'design'],
  };
  for (const [path, tags] of Object.entries(seeded)) plugin.data.metadata[path] = { tags, description: 'Sample media for the browser preview.' };
  await plugin.persist();
}
const view = plugin.factory(leaf); leaf.view = view;
await view.onOpen();

const themeToggle = document.getElementById('theme-toggle')!;
function setTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  localStorage.setItem('vault-gallery-preview-theme', theme);
}
setTheme(localStorage.getItem('vault-gallery-preview-theme') || 'light');
themeToggle.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
document.getElementById('reset-demo')!.addEventListener('click', () => { localStorage.removeItem('vault-gallery-preview'); location.reload(); });
// Generate a real, small WebM locally, with no downloads or remote media requests.
async function createSampleVideo() {
  if (!('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) return;
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 400;
  const ctx = canvas.getContext('2d')!;
  const stream = canvas.captureStream(24);
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) { stream.getTracks().forEach(track => track.stop()); return; }
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => {
    clearInterval(timer); stream.getTracks().forEach(track => track.stop());
    const blob = new Blob(chunks, { type: mimeType });
    addFile('Motion/Drifting light.webm', URL.createObjectURL(blob), blob.size, 1);
    view.refresh();
  };
  const started = performance.now();
  function paint() {
    const t = (performance.now() - started) / 1000;
    ctx.fillStyle = '#1d3538'; ctx.fillRect(0, 0, 640, 400);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.fillStyle = ['#d4ba88', '#9cae98', '#71948e', '#b7a67d', '#476d6b'][i];
      ctx.arc(90 + i * 115 + Math.sin(t + i) * 30, 190 + Math.cos(t * .8 + i) * 75, 45 + i * 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#edf0df'; ctx.font = '14px sans-serif'; ctx.fillText('DRIFTING LIGHT · SAMPLE VIDEO', 25, 370);
  }
  paint(); recorder.start(); const timer = setInterval(paint, 1000 / 24);
  setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 3000);
}
void createSampleVideo().catch(error => console.warn('Sample video unavailable; add a local video to try playback.', error));
