# PWA icons

Run `bun run generate:icons` from `apps/kajibun-ui` to generate these files from `src/assets/app-icon.png`.

To generate from another PNG:

```sh
bun run generate:icons -- --source path/to/icon.png
```

- `icon-192.png`: 192x192 PNG
- `icon-512.png`: 512x512 PNG
- `icon-512-maskable.png`: 512x512 PNG with safe padding for maskable icons

The script also generates these files directly under `apps/kajibun-ui/public/`:

- `apple-touch-icon.png`: 180x180 PNG for iOS home screen icons
- `favicon.ico`: browser tab icon
