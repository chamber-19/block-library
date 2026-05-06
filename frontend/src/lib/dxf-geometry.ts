import { parseString } from 'dxf'
import * as THREE from 'three'

const LINE_COLOR = '#C4884D'

function makeLineMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: LINE_COLOR })
}

function positionsToLineSegments(
  positions: number[],
  material: THREE.LineBasicMaterial
): THREE.LineSegments {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return new THREE.LineSegments(geo, material)
}

function handleLine(entity: any, group: THREE.Group): void {
  try {
    const { start, end } = entity
    if (!start || !end) return
    const positions = [
      start.x ?? 0, start.y ?? 0, start.z ?? 0,
      end.x ?? 0,   end.y ?? 0,   end.z ?? 0,
    ]
    group.add(positionsToLineSegments(positions, makeLineMaterial()))
  } catch {
    // skip
  }
}

function handleArc(entity: any, group: THREE.Group): void {
  try {
    const cx = entity.center?.x ?? 0
    const cy = entity.center?.y ?? 0
    const cz = entity.center?.z ?? 0
    const r  = entity.radius ?? 1
    let startAngle = (entity.startAngle ?? 0) * (Math.PI / 180)
    let endAngle   = (entity.endAngle   ?? Math.PI * 2) * (Math.PI / 180)
    if (endAngle <= startAngle) endAngle += Math.PI * 2

    const segments = 32
    const positions: number[] = []
    for (let i = 0; i < segments; i++) {
      const t0 = startAngle + (i / segments) * (endAngle - startAngle)
      const t1 = startAngle + ((i + 1) / segments) * (endAngle - startAngle)
      positions.push(
        cx + r * Math.cos(t0), cy + r * Math.sin(t0), cz,
        cx + r * Math.cos(t1), cy + r * Math.sin(t1), cz,
      )
    }
    group.add(positionsToLineSegments(positions, makeLineMaterial()))
  } catch {
    // skip
  }
}

function handleCircle(entity: any, group: THREE.Group): void {
  try {
    const cx = entity.center?.x ?? 0
    const cy = entity.center?.y ?? 0
    const cz = entity.center?.z ?? 0
    const r  = entity.radius ?? 1
    const segments = 64
    const positions: number[] = []
    for (let i = 0; i < segments; i++) {
      const t0 = (i / segments) * Math.PI * 2
      const t1 = ((i + 1) / segments) * Math.PI * 2
      positions.push(
        cx + r * Math.cos(t0), cy + r * Math.sin(t0), cz,
        cx + r * Math.cos(t1), cy + r * Math.sin(t1), cz,
      )
    }
    group.add(positionsToLineSegments(positions, makeLineMaterial()))
  } catch {
    // skip
  }
}

function handlePolyline(entity: any, group: THREE.Group): void {
  try {
    const verts: any[] = entity.vertices ?? []
    if (verts.length < 2) return
    const closed = !!(entity.closed || entity.shape)
    const positions: number[] = []
    const count = closed ? verts.length : verts.length - 1
    for (let i = 0; i < count; i++) {
      const a = verts[i]
      const b = verts[(i + 1) % verts.length]
      positions.push(
        a.x ?? 0, a.y ?? 0, a.z ?? 0,
        b.x ?? 0, b.y ?? 0, b.z ?? 0,
      )
    }
    group.add(positionsToLineSegments(positions, makeLineMaterial()))
  } catch {
    // skip
  }
}

function handleSpline(entity: any, group: THREE.Group): void {
  try {
    const ctrlPts: any[] = entity.controlPoints ?? entity.fitPoints ?? []
    if (ctrlPts.length < 2) return
    const threePoints = ctrlPts.map(
      (p: any) => new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0)
    )
    const curve = new THREE.CatmullRomCurve3(threePoints)
    const samples = 64
    const pts = curve.getPoints(samples)
    const positions: number[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      positions.push(
        pts[i].x,     pts[i].y,     pts[i].z,
        pts[i+1].x,   pts[i+1].y,   pts[i+1].z,
      )
    }
    group.add(positionsToLineSegments(positions, makeLineMaterial()))
  } catch {
    // skip
  }
}

export function dxfToGroup(dxfText: string): THREE.Group {
  const group = new THREE.Group()
  try {
    const parsed = parseString(dxfText)
    const entities: any[] = parsed?.entities ?? []

    for (const entity of entities) {
      try {
        switch (entity.type) {
          case 'LINE':
            handleLine(entity, group)
            break
          case 'ARC':
            handleArc(entity, group)
            break
          case 'CIRCLE':
            handleCircle(entity, group)
            break
          case 'LWPOLYLINE':
          case 'POLYLINE':
            handlePolyline(entity, group)
            break
          case 'SPLINE':
            handleSpline(entity, group)
            break
          case 'TEXT':
          case 'MTEXT':
          case 'HATCH':
          case 'DIMENSION':
          case 'INSERT':
            // skip intentionally
            break
          default:
            // skip unknown types silently
            break
        }
      } catch {
        // skip individual entity errors
      }
    }
  } catch {
    // return empty group on total parse failure
  }
  return group
}
