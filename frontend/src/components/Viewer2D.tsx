import React, { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { MapControls } from '@react-three/drei'
import { buildDxfScene, disposeGroup, type DxfBuildResult } from '../lib/dxf-geometry'

interface Dims {
  w: number
  h: number
  d: number
}

interface Viewer2DProps {
  dxfText: string
  showGrid: boolean
  fitNonce: number
  onBoundsChange: (dims: Dims) => void
  onLayersChange?: (layers: string[]) => void
}

// ---------------------------------------------------------------------------
// SceneInner — built inside <Canvas> so it can call useThree().
// Top-down 2D rendering: ortho camera looking down -Z, MapControls for pan/zoom.
// ---------------------------------------------------------------------------

function SceneInner({
  dxfText,
  showGrid,
  fitNonce,
  onBoundsChange,
  onLayersChange,
}: Viewer2DProps) {
  const { camera, gl, size, invalidate } = useThree()
  const groupRef = useRef<THREE.Group | null>(null)
  const builtRef = useRef<DxfBuildResult | null>(null)

  // Build the geometry group exactly once per dxfText change.
  const built = useMemo(() => {
    return buildDxfScene(dxfText, { mode: '2d' })
  }, [dxfText])

  // Mount the group, dispose on unmount.
  useEffect(() => {
    builtRef.current = built
    return () => {
      if (built.group) disposeGroup(built.group)
    }
  }, [built])

  // Surface layers + dimensions to parent.
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

  // Fit camera whenever fitNonce flips or geometry changes.
  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return
    const bbox = built.bbox
    if (bbox.isEmpty()) {
      camera.left = -10
      camera.right = 10
      camera.top = 10
      camera.bottom = -10
      camera.position.set(0, 0, 100)
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      invalidate()
      return
    }

    const sz = new THREE.Vector3()
    const ct = new THREE.Vector3()
    bbox.getSize(sz)
    bbox.getCenter(ct)
    const aspect = size.width / Math.max(1, size.height)
    const margin = 1.15
    const halfW = (Math.max(sz.x, 0.001) / 2) * margin
    const halfH = (Math.max(sz.y, 0.001) / 2) * margin
    // Match the aspect of the canvas without squashing geometry.
    let l: number, r: number, t: number, b: number
    if (halfW / halfH > aspect) {
      l = -halfW
      r = halfW
      t = halfW / aspect
      b = -halfW / aspect
    } else {
      t = halfH
      b = -halfH
      l = -halfH * aspect
      r = halfH * aspect
    }
    camera.left = l
    camera.right = r
    camera.top = t
    camera.bottom = b
    camera.near = -10000
    camera.far = 10000
    camera.position.set(ct.x, ct.y, 100)
    camera.up.set(0, 1, 0)
    camera.lookAt(ct.x, ct.y, 0)
    camera.updateProjectionMatrix()
    invalidate()
  }, [built, fitNonce, camera, size.width, size.height, invalidate])

  // Update renderer clear color to match container background.
  useEffect(() => {
    gl.setClearColor(0x252420, 1)
  }, [gl])

  return (
    <>
      {/* In 2D mode we only need lines; ambient light is enough. */}
      <ambientLight intensity={1.0} />
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
// Viewer2D — public wrapper with the <Canvas> and an orthographic camera.
// ---------------------------------------------------------------------------

export function Viewer2D(props: Viewer2DProps) {
  return (
    <Canvas
      style={{ width: '100%', height: '100%', background: 'var(--bg-raised)' }}
      frameloop="demand"
      orthographic
      camera={{ zoom: 1, position: [0, 0, 100], near: -10000, far: 10000 }}
    >
      <MapControls
        makeDefault
        enableRotate={false}
        screenSpacePanning
        dampingFactor={0.1}
      />
      <SceneInner {...props} />
    </Canvas>
  )
}
