Media Hub 0.2.0 adds media import and gallery settings.

Requires Obsidian **1.7.2 or newer**. Licensed under **GNU GPL v3.0** (`GPL-3.0-only`). The plugin ID remains `vault-gallery`, preserving existing tags and settings.

Use **Add media** to select one or more files. Files are copied into `Media` by default; choose an existing folder or enter a new vault-relative path in **Settings → Media Hub** or from the gallery gear button. Leave the path empty for the vault root. Existing media is not moved, and duplicate names receive numbered suffixes rather than replacing files.

Use the panel button beside the title to hide or show the folder pane. Your preference is remembered.

[Buy me a coffee](https://buymeacoffee.com/sahandprs)

### Updates

- Multi-file media import with progress and per-file failure reporting.
- Configurable import folder with nested folder creation and collision-safe filenames.
- Collapsible folder pane with saved visibility.
- Settings for import destination, thumbnail size, and pane visibility; searchable on Obsidian 1.13+.
- Backward-compatible settings migration and additional import/settings tests.
