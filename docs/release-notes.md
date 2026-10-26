Media Hub 0.3.1 fixes filename saving and adds original-file downloads.

Editing **File name** and clicking **Save details** now applies the rename along with tags and description. **Rename file** and Enter remain available. Invalid names and collisions show an error without saving details to the wrong path.

Use **Download** in the selection toolbar or file preview to save copies on your device. Multiple files stay separate in their original formats—no ZIP archive. Use individual save buttons if your device blocks bulk downloads. Where supported, **Share / Save to Files** opens the native share sheet. Actual save destinations depend on the device; mobile functionality still requires device testing. Exports are prepared in memory and limited to 512 MB per selection.

Requires Obsidian **1.7.2+**. Existing vault files are preserved by downloading. Licensed under **GPL-3.0-only**.

[Buy me a coffee](https://buymeacoffee.com/sahandprs)

### Updates

- Apply filename edits through Save details, preserving tags and descriptions.
- Download original media from previews or multiple selections without archives.
- Offer individual saves and supported native sharing.
- Add tests for original bytes, filenames, combined rename/save, and read failures.
