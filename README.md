# Vault Gallery

An Obsidian plugin that brings your vault's media into a searchable gallery. The layout follows the provided sketches: folder navigation on the left, media filters above a resizable grid, and an expanded preview with a details panel when you select a file.

## Screenshots

The screenshots show the production gallery view running in the browser preview with a sample vault. Actual Obsidian colors follow your theme.

![Media gallery with folders and filters](docs/images/gallery.jpg)

![Expanded preview with editable filename, tags, and description](docs/images/details.jpg)

## Install with BRAT

This plugin is not yet listed in Obsidian's Community plugins directory. To install from this repository:

1. Install and enable **BRAT** from **Settings → Community plugins → Browse**.
2. Open BRAT settings and choose **Add a beta plugin**.
3. Paste `https://github.com/sahandps/obsidian-vault-gallery` and add the plugin.
4. Enable **Vault Gallery** in Community plugins if BRAT has not enabled it.
5. Click the images ribbon icon or run **Vault Gallery: Open gallery**.

See the [BRAT installation guide](https://github.com/TfTHacker/obsidian42-brat) and [latest release](https://github.com/sahandps/obsidian-vault-gallery/releases/latest).

## Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/sahandps/obsidian-vault-gallery/releases/latest), place them in `<vault>/.obsidian/plugins/vault-gallery/`, reload Obsidian, and enable **Vault Gallery** under Community plugins.

## Build and install from source

1. Run `npm install` and `npm run package` in this project (Node.js 18 or newer).
2. In your vault, create `.obsidian/plugins/vault-gallery/`.
3. Copy `main.js`, `manifest.json`, and `styles.css` from `release/vault-gallery/` into that folder.
4. Reload Obsidian. In **Settings → Community plugins**, enable **Vault Gallery**. Community plugins must be enabled.
5. Click the images icon in the left ribbon, or run **Vault Gallery: Open gallery** in the command palette.

Use a test vault for your first run. This plugin has automated tests but has not yet been verified inside a running Obsidian app.

## Included

- Discovers media files already in the vault and updates after files are added, modified, renamed, moved, or deleted.
- Separate All media, Images, GIFs, Videos, Audio, and PDFs tabs.
- Folder filters include nested folders; “Vault root” shows files directly at the root.
- Search across paths, tags, and descriptions. Every search word must match.
- Tag filter and sorting by modified date, name, or file size.
- Adjustable thumbnail sizes, saved across sessions.
- Expanded image/GIF preview with zoom, and video/audio playback controls.
- Editable filename in the details panel: change the name and click **Rename file**, or press Enter. The extension and folder stay the same. Duplicate and invalid names are rejected. Obsidian manages updates to linked notes according to your vault settings. Gallery tags and unsaved detail edits stay attached when you rename from this panel.
- File path, format, size, file-system dates, image dimensions, or playback duration in the details panel.
- Editable comma-separated tags and descriptions. Click **Save details** before switching files. Tags are normalized to lowercase and duplicate tags are removed.
- Previous/next buttons and left/right arrow navigation; Escape closes the preview when outside a form or player.
- Opens the original file in a separate Obsidian tab. PDFs open in Obsidian's reader.
- Theme-aware styles and a stacked preview on narrow panels.

## Media and performance

Recognizes common image, video, audio, GIF, and PDF extensions, including HEIC, TIFF, AVI, and MKV. Recognition does **not** guarantee a preview: decoding depends on Obsidian and your device. Unsupported formats show a fallback. No transcoder, external service, or AI categorization is included.

The gallery lists files exposed by Obsidian's Vault API, not hidden system folders or remote media embedded in notes. Images use browser lazy loading; videos and audio are loaded only in the selected preview. GIF thumbnails animate when loaded. The initial grid renders 80 items, then loads more as you scroll (with a manual button as fallback). The grid is incremental rather than fully virtualized; thumbnails are not pre-generated or cached separately, so very large original images can still use significant memory.

## Where tags are stored

Tags and descriptions are saved in `.obsidian/plugins/vault-gallery/data.json` using Obsidian's plugin storage. They do not modify embedded EXIF/IPTC metadata or appear in Obsidian's native tag search. File moves and renames observed while the plugin is running preserve the associated details, including folder moves. Moves made while the plugin is disabled cannot be reconciled automatically. Sync the plugin's `data.json` if you need these details on another device; plugin data is not merged across simultaneous edits on multiple devices.

The dates shown are file-system created/modified dates, not camera capture dates. Gallery details are saved explicitly and unsaved form edits are discarded when you change selection or close the preview.

## Development and checks

```sh
npm install
npm run dev      # rebuild main.js on changes
npm run build    # TypeScript check + production bundle
npm test         # model and DOM integration tests
npm run package  # installable folder under release/vault-gallery
```

The runtime uses only Obsidian's API and native browser elements, without Node APIs, to support desktop and mobile. Mobile behavior still requires device testing.

Before publishing: test in Obsidian with light/dark themes, a large vault, unavailable codecs, file sync, and mobile. This is an initial local version, not a published community plugin.

## Browser preview

Run `npm run preview`, then open **http://127.0.0.1:4173/**. This runs the production gallery view with an Obsidian adapter and a sample vault, served only on your computer. Try the folder/type/tag filters, image zoom, animated GIF, audio/video playback, and editable details. Sample illustrations, animation, audio, PDF, and video are generated locally; no external media requests are needed.

**Add local media** lets you preview your own files for the current session; those files stay in the browser and are not uploaded. Tags and thumbnail size persist in browser local storage separately from Obsidian's plugin data. **Reset demo** clears the preview's saved details and reloads the sample vault. **Open in Obsidian** opens the original media in a browser tab in this preview. Renaming in the preview changes only its simulated vault, not the files on your disk, and lasts until you reload. Real vault discovery and file-change events require Obsidian.


## Releases and license

Licensed under the [MIT License](LICENSE). Continuous integration builds the plugin and runs its tests. To publish a new version, update `package.json`, `manifest.json`, `versions.json`, and `docs/release-notes.md`, then push a matching numeric Git tag (for example, `0.1.1`). GitHub Actions builds and attaches `main.js`, `manifest.json`, and `styles.css` to the release for BRAT and manual installation.
