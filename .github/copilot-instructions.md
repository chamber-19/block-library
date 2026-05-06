# Block Library — Copilot Instructions

## Purpose

Single-purpose Tauri 2 desktop app: browse the Chamber 19 AutoCAD block catalog and preview DXF files in a 3D viewer. No other features.

## Data layer

- **Source of truth**: Google Drive folder tree. Root folder ID and API key are build-time secrets — never hardcode them.
- **Local cache**: SQLite at `{app_data_dir}/block-library.db`. The catalog is synced from Drive on demand; SQLite is the cache, not the primary store.
- No Supabase. No Postgres. No Docker. No nginx.

## Frontend stack

- React 19 + Vite + TypeScript (strict mode)
- Three.js `^0.160` + React Three Fiber `^8` for the DXF viewer
- Use `@react-three/drei` `OrbitControls` with `makeDefault` prop
- DXF parsing: `dxf` npm package, `parseString` function, client-side only
- No server-side rendering or conversion

## DXF viewer rules

- Only `.dxf` files are renderable. `.dwg` files must show: "DWG format cannot be previewed directly. Convert to DXF for preview."
- Every `useEffect` that creates Three.js geometry or materials **must** include a cleanup function that calls `geometry.dispose()` and `material.dispose()` on unmount. Forgetting this causes GPU memory leaks.
- Lights, cameras, and the renderer are owned by the `<Canvas>` component — do not create them manually inside scene children.

## Tauri 2 IPC

- Command arguments must be camelCase on both the TypeScript and Rust sides.
- All Tauri commands must return `Result<T, String>` — never `unwrap()` or `expect()` in command handlers.
- Wrap every `invoke()` call in an `isTauri` guard so the component degrades gracefully in a plain browser (useful for Storybook / unit tests).

```ts
import { invoke } from '@tauri-apps/api/core'

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

if (isTauri) {
  const result = await invoke<MyType>('command_name', { someArg: value })
}
```

## Rust / build secrets

- Drive credentials are obfuscated with `litcrypt2`. The `extern crate alloc;` workaround is required when `litcrypt2` is used in a library crate — include it at the crate root.
- `build.rs` reads `DRIVE_ROOT_FOLDER_ID` and `DRIVE_API_KEY` from environment and XOR-obfuscates before embedding. Never read these env vars at runtime directly.

## Code discipline

- Minimal diffs — don't reformat adjacent code.
- No abstractions before two real consumers exist.
- Design tokens: background `#1C1B19`, accent `#C4884D`, success `#6B9E6B`, warning `#C4A24D`, error `#B85C5C`, info `#5C8EB8`.
- Fonts: DM Sans (body), Instrument Serif (display), JetBrains Mono (data/technical).
