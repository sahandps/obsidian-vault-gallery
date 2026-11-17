Media Hub 0.6.2 adds a **GIFs** tab to Immich. GIFs stay out of the **Images** filter and animate when opened in a gallery preview or an inline note embed. The grid still loads only thumbnails.

To play animations, use an Immich API key that also has `asset.download`, then replace the key under **Settings → Media Hub → Immich**. Immich requires this permission for the original GIF. Media Hub fetches it on demand and does not save it to your vault. Keys without this permission can still show GIF thumbnails.

Immich requires **Obsidian 1.11.4+**. Local media browsing still supports **Obsidian 1.7.2+**.
