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

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

if (isTauri) {
  const result = await invoke<MyType>('command_name', { someArg: value })
}
```

## Rust / build secrets

- Drive credentials are obfuscated with `litcrypt2`. The `extern crate alloc;` workaround is required when `litcrypt2` is used in a library crate — include it at the crate root.
- `build.rs` reads `DRIVE_ROOT_FOLDER_ID` and `DRIVE_API_KEY` from environment and XOR-obfuscates before embedding. Never read these env vars at runtime directly.

## AutoCAD domain context

This app displays blocks from the R3P AutoCAD block catalog. It does not run AutoCAD .NET code — DXF parsing is client-side via the `dxf` npm package. However, the blocks, layers, and naming conventions it surfaces come directly from R3P AutoCAD drawings. For domain context on how those drawings are structured, consult `autocad-knowledge`:

- `glossary/terminology.md` — R3P domain abbreviations (BESS, IFC, CATL TOP, GCB, panel schedules, terminal variants)
- `glossary/layer-conventions.md` — confirmed layer naming patterns from R3P drawings (`EQUIP`, `TEXT`, `Foundation`, grounding layers)
- `api-surface-comparison.md` — where this app fits in the AutoCAD ecosystem (closest analogue is APS Viewer: read-only display of geometry)

When working on block catalog naming, layer filtering, or search/browse features, these files define the domain vocabulary this app must speak.

## Code discipline

- Minimal diffs — don't reformat adjacent code.
- No abstractions before two real consumers exist.
- Design tokens: background `#1C1B19`, accent `#C4884D`, success `#6B9E6B`, warning `#C4A24D`, error `#B85C5C`, info `#5C8EB8`.
- Fonts: DM Sans (body), Instrument Serif (display), JetBrains Mono (data/technical).


<!-- Added by chamber-19-skill-sync — required skill references for this repo's stack -->
- Read [`docs/skills/RUST.MD`](https://github.com/chamber-19/.github/blob/main/docs/skills/RUST.MD) before any Rust work.
- Read [`docs/skills/TAURI.MD`](https://github.com/chamber-19/.github/blob/main/docs/skills/TAURI.MD) before any Tauri work.
