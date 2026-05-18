import { parseString } from 'dxf'
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Module: DXF → Three.js group builder
//
// Builds a THREE.Group from a DXF string. Each entity becomes one or more
// child objects. The same parser feeds both the 2-D (top-down ortho) and
// 3-D (perspective + orbit) viewers — they only differ in how the scene is
// composed around the returned group.
//
// Supported DXF entities:
//   LINE, ARC, CIRCLE, ELLIPSE
//   LWPOLYLINE, POLYLINE (2D + 3D vertices, closed flag, bulge approximation)
//   SPLINE (CatmullRom interpolation through control/fit points)
//   3DFACE, SOLID, TRACE       — triangle / quad meshes
//   INSERT                     — block reference flattening from parsed.blocks
//   TEXT, MTEXT                — flat billboard text (approximate)
//   thickness                  — extruded along +Z to form a thin wall
//
// Layer mapping:
//   - Each entity's `layer` is hashed into a deterministic palette color.
//   - 0 / Defpoints / system layers fall back to the accent color.
//   - The caller can also pass a uniform color to force monochrome rendering.
//
// All meshes are dispose-tracked: callers must walk the group on unmount
// and call `geometry.dispose()` + `material.dispose()` to release GPU VRAM.
// ---------------------------------------------------------------------------

export type RenderMode = '2d' | '3d'

export interface DxfBuildOptions {
  /** Render mode — selects line vs mesh emphasis and whether to extrude. */
  mode: RenderMode
  /** Optional fixed color override (hex string e.g. '#C4884D'). */
  forceColor?: string
}

export interface DxfBuildResult {
  group: THREE.Group
  /** Distinct layer names encountered, in first-seen order. */
  layers: string[]
  /** Bounding box of the assembled group. */
  bbox: THREE.Box3
  /** Entity counts keyed by type for the detail pane. */
  counts: Record<string, number>
}

// ---------------------------------------------------------------------------
// Palette — deterministic per-layer color
// ---------------------------------------------------------------------------

const ACCENT = '#C4884D'

const LAYER_PALETTE: string[] = [
  '#C4884D', // accent
  '#5C8EB8', // info
  '#6B9E6B', // success
  '#C4A24D', // warning
  '#B85C5C', // error
  '#A37FC4', // violet
  '#4DB89E', // teal
  '#C46D4D', // brick
  '#7BA34D', // moss
  '#9E7BC4', // lilac
]

function hashLayerName(name: string): number {
  let h = 5381
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h + name.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function colorForLayer(name: string | undefined, override?: string): string {
  if (override) return override
  if (!name) return ACCENT
  const norm = name.toString().toLowerCase()
  if (norm === '0' || norm === 'defpoints' || norm === '') return ACCENT
  return LAYER_PALETTE[hashLayerName(norm) % LAYER_PALETTE.length]
}

// ---------------------------------------------------------------------------
// Material cache (deduped per layer + mode)
// ---------------------------------------------------------------------------

interface MaterialBag {
  line: Map<string, THREE.LineBasicMaterial>
  mesh: Map<string, THREE.MeshStandardMaterial>
  disposables: Array<THREE.Material>
}

function newBag(): MaterialBag {
  return { line: new Map(), mesh: new Map(), disposables: [] }
}

function lineMat(bag: MaterialBag, color: string): THREE.LineBasicMaterial {
  let m = bag.line.get(color)
  if (!m) {
    m = new THREE.LineBasicMaterial({ color, linewidth: 1 })
    bag.line.set(color, m)
    bag.disposables.push(m)
  }
  return m
}

function meshMat(bag: MaterialBag, color: string): THREE.MeshStandardMaterial {
  let m = bag.mesh.get(color)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.1,
      roughness: 0.7,
      side: THREE.DoubleSide,
      flatShading: true,
    })
    bag.mesh.set(color, m)
    bag.disposables.push(m)
  }
  return m
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

interface Vec3Like {
  x?: number
  y?: number
  z?: number
}

function vx(p: Vec3Like | undefined | null): [number, number, number] {
  if (!p) return [0, 0, 0]
  return [p.x ?? 0, p.y ?? 0, p.z ?? 0]
}

function pushSeg(
  positions: number[],
  a: [number, number, number],
  b: [number, number, number],
): void {
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
}

// ---------------------------------------------------------------------------
// Entity handlers — populate a per-layer positions buffer for line geometry
// or directly append meshes for surfaces.
// ---------------------------------------------------------------------------

interface LinesByLayer {
  [layer: string]: number[]
}

function pushLayerSeg(
  out: LinesByLayer,
  layer: string,
  a: [number, number, number],
  b: [number, number, number],
): void {
  let buf = out[layer]
  if (!buf) {
    buf = []
    out[layer] = buf
  }
  pushSeg(buf, a, b)
}

function entityLayer(e: any): string {
  const l = e?.layer
  if (typeof l === 'string' && l.length > 0) return l
  return '0'
}

// ---- LINE -----------------------------------------------------------------

function handleLine(e: any, out: LinesByLayer): void {
  const layer = entityLayer(e)
  pushLayerSeg(out, layer, vx(e.start), vx(e.end))
}

// ---- CIRCLE / ARC ---------------------------------------------------------

function handleCircle(e: any, out: LinesByLayer): void {
  const layer = entityLayer(e)
  const [cx, cy, cz] = vx(e.center)
  const r = e.radius ?? 1
  const segments = 64
  for (let i = 0; i < segments; i++) {
    const t0 = (i / segments) * Math.PI * 2
    const t1 = ((i + 1) / segments) * Math.PI * 2
    pushLayerSeg(
      out,
      layer,
      [cx + r * Math.cos(t0), cy + r * Math.sin(t0), cz],
      [cx + r * Math.cos(t1), cy + r * Math.sin(t1), cz],
    )
  }
}

function handleArc(e: any, out: LinesByLayer): void {
  const layer = entityLayer(e)
  const [cx, cy, cz] = vx(e.center)
  const r = e.radius ?? 1
  let startAngle = (e.startAngle ?? 0) * (Math.PI / 180)
  let endAngle = (e.endAngle ?? 360) * (Math.PI / 180)
  if (endAngle <= startAngle) endAngle += Math.PI * 2
  const segments = 48
  for (let i = 0; i < segments; i++) {
    const t0 = startAngle + (i / segments) * (endAngle - startAngle)
    const t1 = startAngle + ((i + 1) / segments) * (endAngle - startAngle)
    pushLayerSeg(
      out,
      layer,
      [cx + r * Math.cos(t0), cy + r * Math.sin(t0), cz],
      [cx + r * Math.cos(t1), cy + r * Math.sin(t1), cz],
    )
  }
}

// ---- ELLIPSE --------------------------------------------------------------

function handleEllipse(e: any, out: LinesByLayer): void {
  const layer = entityLayer(e)
  const [cx, cy, cz] = vx(e.center)
  const [mx, my] = vx(e.majorAxisEndPoint)
  const ratio = e.axisRatio ?? 1
  const major = Math.sqrt(mx * mx + my * my)
  if (major <= 0) return
  const minor = major * ratio
  const rot = Math.atan2(my, mx)
  let startAngle = e.startAngle ?? 0
  let endAngle = e.endAngle ?? Math.PI * 2
  if (endAngle <= startAngle) endAngle += Math.PI * 2
  const segments = 48
  for (let i = 0; i < segments; i++) {
    const t0 = startAngle + (i / segments) * (endAngle - startAngle)
    const t1 = startAngle + ((i + 1) / segments) * (endAngle - startAngle)
    const ax = major * Math.cos(t0)
    const ay = minor * Math.sin(t0)
    const bx = major * Math.cos(t1)
    const by = minor * Math.sin(t1)
    pushLayerSeg(
      out,
      layer,
      [cx + ax * Math.cos(rot) - ay * Math.sin(rot), cy + ax * Math.sin(rot) + ay * Math.cos(rot), cz],
      [cx + bx * Math.cos(rot) - by * Math.sin(rot), cy + bx * Math.sin(rot) + by * Math.cos(rot), cz],
    )
  }
}

// ---- POLYLINE / LWPOLYLINE ------------------------------------------------

function bulgePoints(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  bulge: number,
  steps: number,
): Array<[number, number, number]> {
  // Bulge-to-arc approximation: bulge = tan(theta/4), where theta is the
  // included angle. Skipping the curved expansion is acceptable for preview.
  if (!bulge || Math.abs(bulge) < 1e-6) {
    return [[a.x, a.y, a.z], [b.x, b.y, b.z]]
  }
  const theta = 4 * Math.atan(bulge)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const chord = Math.sqrt(dx * dx + dy * dy)
  if (chord < 1e-9) return [[a.x, a.y, a.z], [b.x, b.y, b.z]]
  const radius = chord / (2 * Math.sin(theta / 2))
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const sag = radius - Math.sqrt(Math.max(0, radius * radius - chord * chord / 4))
  const nx = -dy / chord
  const ny = dx / chord
  const sign = bulge > 0 ? 1 : -1
  const cx = midX + nx * (radius - sag) * sign
  const cy = midY + ny * (radius - sag) * sign
  const angleA = Math.atan2(a.y - cy, a.x - cx)
  const angleB = angleA + theta
  const pts: Array<[number, number, number]> = []
  for (let i = 0; i <= steps; i++) {
    const t = angleA + (i / steps) * (angleB - angleA)
    pts.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t), a.z])
  }
  return pts
}

function handlePolyline(e: any, out: LinesByLayer): void {
  const layer = entityLayer(e)
  const verts: any[] = e.vertices ?? []
  if (verts.length < 2) return
  const closed = !!(e.closed || e.shape || e.flags === 1)
  const count = closed ? verts.length : verts.length - 1
  for (let i = 0; i < count; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % verts.length]
    const ax = { x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 }
    const bx = { x: b.x ?? 0, y: b.y ?? 0, z: b.z ?? 0 }
    const bulge = a.bulge ?? 0
    if (Math.abs(bulge) > 1e-6) {
      const pts = bulgePoints(ax, bx, bulge, 12)
      for (let k = 0; k < pts.length - 1; k++) {
        pushLayerSeg(out, layer, pts[k], pts[k + 1])
      }
    } else {
      pushLayerSeg(out, layer, [ax.x, ax.y, ax.z], [bx.x, bx.y, bx.z])
    }
  }
}

// ---- SPLINE ---------------------------------------------------------------

function handleSpline(e: any, out: LinesByLayer): void {
  const layer = entityLayer(e)
  const ctrl: any[] = e.controlPoints ?? e.fitPoints ?? []
  if (ctrl.length < 2) return
  const pts = ctrl.map((p) => new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0))
  const curve = new THREE.CatmullRomCurve3(pts)
  const samples = Math.max(32, ctrl.length * 8)
  const sampled = curve.getPoints(samples)
  for (let i = 0; i < sampled.length - 1; i++) {
    const a = sampled[i]
    const b = sampled[i + 1]
    pushLayerSeg(out, layer, [a.x, a.y, a.z], [b.x, b.y, b.z])
  }
}

// ---- 3DFACE / SOLID / TRACE — triangle/quad mesh -------------------------

function handleFace(e: any, group: THREE.Group, bag: MaterialBag, force?: string): void {
  // 3DFACE has up to 4 corners. SOLID/TRACE are 4-corner planar faces.
  const corners: Array<[number, number, number]> = []
  for (const k of ['firstCorner', 'secondCorner', 'thirdCorner', 'fourthCorner']) {
    const p = e[k]
    if (p) corners.push(vx(p))
  }
  // Some parsers use vertices[0..3] instead.
  if (corners.length === 0 && Array.isArray(e.vertices) && e.vertices.length >= 3) {
    for (let i = 0; i < Math.min(4, e.vertices.length); i++) {
      corners.push(vx(e.vertices[i]))
    }
  }
  if (corners.length < 3) return

  const layer = entityLayer(e)
  const color = colorForLayer(layer, force)
  const positions: number[] = []
  // Triangle 1: 0-1-2
  positions.push(...corners[0], ...corners[1], ...corners[2])
  // Triangle 2 if quad: 0-2-3
  if (corners.length === 4) {
    positions.push(...corners[0], ...corners[2], ...corners[3])
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, meshMat(bag, color))
  mesh.userData.dxfType = '3DFACE'
  mesh.userData.dxfLayer = layer
  group.add(mesh)
}

// ---- TEXT / MTEXT — minimal billboard ------------------------------------

function handleText(e: any, out: LinesByLayer): void {
  // We don't ship a font, so render an underline ticked rectangle as a
  // placeholder. The viewer will display text content in the detail pane.
  const layer = entityLayer(e)
  const [x, y, z] = vx(e.startPoint ?? e.position ?? e.insertionPoint)
  const h = e.textHeight ?? e.height ?? 1
  const len = (e.text?.length ?? 4) * h * 0.6
  // Baseline tick mark + bounding underline
  pushLayerSeg(out, layer, [x, y, z], [x + len, y, z])
  pushLayerSeg(out, layer, [x, y, z], [x, y + h * 0.2, z])
  pushLayerSeg(out, layer, [x + len, y, z], [x + len, y + h * 0.2, z])
}

// ---- INSERT — flatten a block reference ----------------------------------

function buildTransform(e: any): THREE.Matrix4 {
  const [tx, ty, tz] = vx(e.position ?? e.insertionPoint)
  const sx = e.xScale ?? 1
  const sy = e.yScale ?? 1
  const sz = e.zScale ?? 1
  const rot = ((e.rotation ?? 0) * Math.PI) / 180
  const m = new THREE.Matrix4()
  m.compose(
    new THREE.Vector3(tx, ty, tz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rot)),
    new THREE.Vector3(sx, sy, sz),
  )
  return m
}

interface BlockDef {
  entities: any[]
  basePoint?: Vec3Like
}

function resolveBlocks(parsed: any): Record<string, BlockDef> {
  // The `dxf` package emits blocks either as a Record or an Array. Normalize.
  const raw = parsed?.blocks
  const out: Record<string, BlockDef> = {}
  if (!raw) return out
  if (Array.isArray(raw)) {
    for (const b of raw) {
      if (b?.name) out[b.name] = { entities: b.entities ?? [], basePoint: b.basePoint ?? b.position }
    }
  } else if (typeof raw === 'object') {
    for (const k of Object.keys(raw)) {
      const b = raw[k]
      out[k] = { entities: b?.entities ?? [], basePoint: b?.basePoint ?? b?.position }
    }
  }
  return out
}

// ---- Extrusion (DXF thickness attribute) ---------------------------------

function extrudeLine(
  e: any,
  thickness: number,
  group: THREE.Group,
  bag: MaterialBag,
  force?: string,
): void {
  const [ax, ay, az] = vx(e.start)
  const [bx, by, bz] = vx(e.end)
  const layer = entityLayer(e)
  const color = colorForLayer(layer, force)
  // Build a quad: (a) → (b) → (b+Zt) → (a+Zt)
  const positions = new Float32Array([
    ax, ay, az,
    bx, by, bz,
    bx, by, bz + thickness,
    ax, ay, az,
    bx, by, bz + thickness,
    ax, ay, az + thickness,
  ])
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, meshMat(bag, color))
  mesh.userData.dxfType = 'LINE(extruded)'
  mesh.userData.dxfLayer = layer
  group.add(mesh)
}

function extrudeCircle(
  e: any,
  thickness: number,
  group: THREE.Group,
  bag: MaterialBag,
  force?: string,
): void {
  const [cx, cy, cz] = vx(e.center)
  const r = e.radius ?? 1
  const layer = entityLayer(e)
  const color = colorForLayer(layer, force)
  const shape = new THREE.Shape()
  shape.absarc(0, 0, r, 0, Math.PI * 2, false)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 48,
  })
  geo.translate(cx, cy, cz)
  const mesh = new THREE.Mesh(geo, meshMat(bag, color))
  mesh.userData.dxfType = 'CIRCLE(extruded)'
  mesh.userData.dxfLayer = layer
  group.add(mesh)
}

function extrudePolyline(
  e: any,
  thickness: number,
  group: THREE.Group,
  bag: MaterialBag,
  force?: string,
): void {
  const verts: any[] = e.vertices ?? []
  if (verts.length < 3) return
  const closed = !!(e.closed || e.shape || e.flags === 1)
  if (!closed) return // Open polylines extrude as a swept ribbon; skip for v1.
  const layer = entityLayer(e)
  const color = colorForLayer(layer, force)
  const shape = new THREE.Shape()
  const v0 = verts[0]
  shape.moveTo(v0.x ?? 0, v0.y ?? 0)
  for (let i = 1; i < verts.length; i++) {
    shape.lineTo(verts[i].x ?? 0, verts[i].y ?? 0)
  }
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  })
  const baseZ = v0.z ?? 0
  if (baseZ !== 0) geo.translate(0, 0, baseZ)
  const mesh = new THREE.Mesh(geo, meshMat(bag, color))
  mesh.userData.dxfType = 'LWPOLYLINE(extruded)'
  mesh.userData.dxfLayer = layer
  group.add(mesh)
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

function buildEntities(
  entities: any[],
  blocks: Record<string, BlockDef>,
  parent: THREE.Group,
  linesOut: LinesByLayer,
  bag: MaterialBag,
  opts: DxfBuildOptions,
  counts: Record<string, number>,
  layers: Set<string>,
  parentTransform?: THREE.Matrix4,
): void {
  for (const entity of entities) {
    if (!entity || typeof entity.type !== 'string') continue
    const type = entity.type.toUpperCase()
    counts[type] = (counts[type] ?? 0) + 1
    layers.add(entityLayer(entity))

    try {
      switch (type) {
        case 'LINE': {
          const t = entity.thickness ?? 0
          if (opts.mode === '3d' && Math.abs(t) > 1e-6) {
            extrudeLine(entity, t, parent, bag, opts.forceColor)
          } else {
            handleLine(entity, linesOut)
          }
          break
        }
        case 'CIRCLE': {
          const t = entity.thickness ?? 0
          if (opts.mode === '3d' && Math.abs(t) > 1e-6) {
            extrudeCircle(entity, t, parent, bag, opts.forceColor)
          } else {
            handleCircle(entity, linesOut)
          }
          break
        }
        case 'ARC':
          handleArc(entity, linesOut)
          break
        case 'ELLIPSE':
          handleEllipse(entity, linesOut)
          break
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const t = entity.thickness ?? 0
          if (opts.mode === '3d' && Math.abs(t) > 1e-6) {
            extrudePolyline(entity, t, parent, bag, opts.forceColor)
          } else {
            handlePolyline(entity, linesOut)
          }
          break
        }
        case 'SPLINE':
          handleSpline(entity, linesOut)
          break
        case '3DFACE':
        case 'SOLID':
        case 'TRACE':
          if (opts.mode === '3d') {
            handleFace(entity, parent, bag, opts.forceColor)
          } else {
            // Render outline in 2D
            const corners: Array<[number, number, number]> = []
            for (const k of ['firstCorner', 'secondCorner', 'thirdCorner', 'fourthCorner']) {
              if (entity[k]) corners.push(vx(entity[k]))
            }
            const layer = entityLayer(entity)
            for (let i = 0; i < corners.length; i++) {
              const a = corners[i]
              const b = corners[(i + 1) % corners.length]
              pushLayerSeg(linesOut, layer, a, b)
            }
          }
          break
        case 'TEXT':
        case 'MTEXT':
          handleText(entity, linesOut)
          break
        case 'INSERT': {
          const block = blocks[entity.block ?? entity.name ?? '']
          if (!block) break
          const t = buildTransform(entity)
          if (parentTransform) t.premultiply(parentTransform)
          // Apply basePoint offset (subtract — DXF basePoint marks the insert origin in the block).
          if (block.basePoint) {
            const off = new THREE.Matrix4().makeTranslation(
              -(block.basePoint.x ?? 0),
              -(block.basePoint.y ?? 0),
              -(block.basePoint.z ?? 0),
            )
            t.multiply(off)
          }
          const subgroup = new THREE.Group()
          subgroup.matrix.copy(t)
          subgroup.matrixAutoUpdate = false
          const subLines: LinesByLayer = {}
          buildEntities(block.entities, blocks, subgroup, subLines, bag, opts, counts, layers, t)
          flushLines(subLines, subgroup, bag, opts.forceColor)
          parent.add(subgroup)
          break
        }
        default:
          // HATCH, DIMENSION, LEADER, IMAGE, etc. — skip silently.
          break
      }
    } catch {
      // Skip malformed entity, keep building the rest.
    }
  }
}

function flushLines(
  lines: LinesByLayer,
  parent: THREE.Group,
  bag: MaterialBag,
  forceColor: string | undefined,
): void {
  for (const layer of Object.keys(lines)) {
    const positions = lines[layer]
    if (positions.length === 0) continue
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const color = colorForLayer(layer, forceColor)
    const seg = new THREE.LineSegments(geo, lineMat(bag, color))
    seg.userData.dxfLayer = layer
    parent.add(seg)
  }
}

export function buildDxfScene(dxfText: string, opts: DxfBuildOptions): DxfBuildResult {
  const group = new THREE.Group()
  const layersSet = new Set<string>()
  const counts: Record<string, number> = {}
  const bag = newBag()

  try {
    const parsed = parseString(dxfText)
    const entities: any[] = parsed?.entities ?? []
    const blocks = resolveBlocks(parsed)
    const lines: LinesByLayer = {}
    buildEntities(entities, blocks, group, lines, bag, opts, counts, layersSet)
    flushLines(lines, group, bag, opts.forceColor)
  } catch {
    // Total parse failure — return an empty group with empty stats.
  }

  const bbox = new THREE.Box3().setFromObject(group)
  return {
    group,
    layers: Array.from(layersSet),
    bbox,
    counts,
  }
}

// ---------------------------------------------------------------------------
// Backwards-compatible wrapper retained for older callers that only need
// a 3-D Three.Group. New code should prefer `buildDxfScene`.
// ---------------------------------------------------------------------------

export function dxfToGroup(dxfText: string): THREE.Group {
  return buildDxfScene(dxfText, { mode: '3d' }).group
}

// ---------------------------------------------------------------------------
// Disposal — walk a built group and release GPU memory.
// ---------------------------------------------------------------------------

export function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    const anyObj = obj as any
    if (anyObj.geometry && typeof anyObj.geometry.dispose === 'function') {
      anyObj.geometry.dispose()
    }
    if (anyObj.material) {
      const mat = anyObj.material
      if (Array.isArray(mat)) {
        mat.forEach((m: THREE.Material) => m.dispose())
      } else {
        ;(mat as THREE.Material).dispose()
      }
    }
  })
}
