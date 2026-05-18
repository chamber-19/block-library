import React, { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { buildDxfScene, disposeGroup, type DxfBuildResult } from '../lib/dxf-geometry'

interface Dims {
  w: number
  h: number
  d: number
}

interface Viewer3DProps {
  dxfText: string
  showGrid: boolean
  autoRotate: boolean
  fitNonce: number
  onBoundsChange: (dims: Dims) => void
  onLayersChange?: (layers: string[]) => void
}

// ---------------------------------------------------------------------------
// SceneInner — built inside <Canvas> so useThree() is valid.
// Perspective camera + ground grid + 3-light rig (matches 3D Toolkit viewer.js
// rig: hemisphere fill + directional key + back light).
// ---------------------------------------------------------------------------

function SceneInner({
  dxfText,
  showGrid,
  fitNonce,
  onBoundsChange,
  onLayersChange,
}: Viewer3DProps) {
  const { camera, gl, size, invalidate } = useThree()
  const groupRef = useRef<THREE.Group | null>(null)
  const builtRef = useRef<DxfBuildResult | null>(null)

  const built = useMemo(() => {
    return buildDxfScene(dxfText, { mode: '3d' })
  }, [dxfText])

  useEffect(() => {
    builtRef.current = built
    return () => {
      if (built.group) disposeGroup(built.group)
    }
  }, [built])

  useEffect(() => {
    if (onLayersChange) onLayersChange(built.layers)
    const s = new THREE.Vector3()
    built.bbox.getSize(s)
    onBoundsChange({
      w: parseFloat(s.x.toFixed(2)),
      h: parseFloat(s.y.toFixed(2)),
      d: parseFloat(s.z.toFixed(2)),
    })
  }, [built, onBoundsChange, onLayersChange])

  // Fit perspective camera to bounding sphere.
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return
    const bbox = built.bbox
    if (bbox.isEmpty()) {
      camera.position.set(15, -15, 12)
      camera.up.set(0, 0, 1)
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      invalidate()
      return
    }

    const sz = new THREE.Vector3()
    const ct = new THREE.Vector3()
    bbox.getSize(sz)
    bbox.getCenter(ct)
    const maxDim = Math.max(sz.x, sz.y, sz.z, 0.001)
    const fov = (camera.fov * Math.PI) / 180
    const dist = (maxDim / 2 / Math.tan(fov / 2)) * 2.2

    // Standard AutoCAD-style SW isometric: looking from +X +Y -Z toward origin,
    // with +Z as up. Adjusts the orbit target to bbox center.
    const dir = new THREE.Vector3(1, -1, 0.8).normalize()
    camera.position.copy(ct.clone().add(dir.multiplyScalar(dist)))
    camera.up.set(0, 0, 1)
    camera.near = Math.max(0.01, dist / 1000)
    camera.far = dist * 100
    camera.lookAt(ct)
    camera.updateProjectionMatrix()
    invalidate()
  }, [built, fitNonce, camera, size.width, size.height, invalidate])

  useEffect(() => {
    gl.setClearColor(0x252420, 1)
  }, [gl])

  return (
    <>
      <ambientLight intensity={0.45} />
      <hemisphereLight args={[0xffffff, 0x6a6562, 0.45]} />
      <directionalLight position={[20, 30, 40]} intensity={0.7} />
      <directionalLight position={[-30, -20, 15]} intensity={0.35} />
      {showGrid && (
        <gridHelper
          args={[1000, 100, '#3a3935', '#2e2d2a']}
          rotation={[Math.PI / 2, 0, 0]}
        />
      )}
      <primitive ref={groupRef} object={built.group} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Viewer3D — Canvas + OrbitControls + corner gizmo axes.
// ---------------------------------------------------------------------------

export function Viewer3D(props: Viewer3DProps) {
  return (
    <Canvas
      style={{ width: '100%', height: '100%', background: 'var(--bg-raised)' }}
      frameloop={props.autoRotate ? 'always' : 'demand'}
      camera={{ fov: 45, near: 0.1, far: 100000, position: [15, -15, 12], up: [0, 0, 1] }}
    >
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={props.autoRotate}
        autoRotateSpeed={0.6}
      />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport
          axisColors={['#C46D4D', '#7BA34D', '#5C8EB8']}
          labelColor="#E8E6E2"
        />
      </GizmoHelper>
      <SceneInner {...props} />
    </Canvas>
  )
}
