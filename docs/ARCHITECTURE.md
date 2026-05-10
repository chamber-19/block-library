# Block Library — Reference Architecture

**Status:** UI-First, Desktop-Native (May 2026)

Block Library is the exception to the backend-first architecture model. Here's why and how it fits:

## Why Block Library Is Different

**The Problem:** Three.js rendering and interactive 3D geometry cannot be effectively delivered via REST API. Streaming geometry data, handling camera controls, and managing GPU memory all require a local, stateful 3D context.

**The Solution:** Keep Block Library as a Tauri 2 desktop app. The interactive viewer and local SQLite cache stay on the client, where they belong.

## Architecture Diagram

```text
┌────────────────────────────────────┐
│ Block Library (Tauri 2 + React)    │
│ ├─ Three.js 3D Viewer              │
│ ├─ React UI                        │
│ ├─ SQLite local cache              │
│ └─ Google Drive sync               │
│    (read-only catalog)             │
└────────────────────────────────────┘

Distinct from backend services:
├─ No REST API (local only)
├─ No sidecar subprocess
├─ No HTTP routing
└─ No multi-user server
```

## Data Flow

1. **On startup:** Tauri app reads `DRIVE_ROOT_FOLDER_ID` and `DRIVE_API_KEY` from embedded secrets
2. **Sync:** App checks Google Drive for new/updated files; caches catalog in SQLite
3. **Browse:** User selects category → app queries SQLite → displays file list
4. **Preview:** User selects `.dxf` → app downloads DXF, parses with `dxf` package, renders with Three.js
5. **Cache:** All downloaded DXFs cached locally; offline browsing supported after first sync

## Launcher Integration

Block Library is still accessible from the `chamber-19/launcher`, but differs from backend services:

- **Not a URL route** — Block Library is a separate Tauri binary
- **Catalog integration** (future): Could expose a `GET /api/catalog/list` endpoint for other apps to discover blocks
- **No Tauri IPC** — already a desktop app, no nested IPC needed
- **Standalone installer** — distributed as its own Windows installer (not bundled with launcher)

## GPU Memory Management

Three.js resources must be explicitly cleaned up:

```typescript
useEffect(() => {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial()
  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  return () => {
    geometry.dispose()      // ← Critical: leak prevention
    material.dispose()
    scene.remove(mesh)
  }
}, [scene])
```

Forgetting cleanup causes GPU VRAM exhaustion over time.

## When to Stay UI-First

Block Library is a template for when UI-first is appropriate:

**Use UI-first when:**

- Real-time 3D rendering required
- Complex interactive state (camera, selection, animation)
- GPU memory management needed
- Low-latency mouse/keyboard response critical

**Don't use UI-first for:**

- Data CRUD operations (use backend service)
- File processing (use backend service)
- Multi-user coordination (use backend service)
- Stateless read endpoints (use backend service)

## Future Optimization (Optional)

If the catalog grows large, consider a hybrid:

1. Keep Three.js viewer in Tauri (UI-first core stays)
2. Extract catalog sync to optional Python backend service:
   - `POST /api/catalog/sync` — triggers Google Drive scan
   - `GET /api/catalog/list` — returns cached metadata
   - `GET /api/catalog/download/{id}` — downloads DXF to client cache

This lets other apps (launcher, drawing-list-manager) discover and share blocks without losing the 3D viewer's responsiveness.

## Deployment

**Development:**

```bash
cd frontend
npm install
npm run desktop
```

**Production:**

```bash
cd frontend
npm run desktop:build
# Outputs: frontend/src-tauri/target/release/bundle/msi-bundle/
#          frontend/src-tauri/target/release/bundle/app/
```

Installer is signed and distributable independently from launcher.

## References

- **Three.js documentation:** [Three.js docs](https://threejs.org/docs/)
- **React Three Fiber:** [R3F docs](https://docs.pmnd.rs/react-three-fiber/)
- **DXF npm package:** [dxf npm](https://www.npmjs.com/package/dxf)
- **Tauri 2 docs:** [Tauri](https://tauri.app/)
