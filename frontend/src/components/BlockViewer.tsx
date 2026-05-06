import React, { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { dxfToGroup } from '../lib/dxf-geometry'

interface BlockMeta {
  id: string
  name: string
  categoryId: string
  driveFileId: string
  fileName: string
  lastModified: string | null
}

interface Dims {
  w: number
  h: number
  d: number
}

interface BlockViewerProps {
  block: BlockMeta | null
  dxfText: string | null | undefined
  onBoundsChange: (dims: Dims) => void
}

// ---------------------------------------------------------------------------
// DxfScene — rendered inside <Canvas>
// ---------------------------------------------------------------------------

interface DxfSceneProps {
  dxfText: string
  onBoundsChange: (dims: Dims) => void
}

function DxfScene({ dxfText, onBoundsChange }: DxfSceneProps) {
  const { camera } = useThree()
  const groupRef = useRef<THREE.Group>(null)

  const group = useMemo(() => {
    try {
      return dxfToGroup(dxfText)
    } catch {
      return new THREE.Group()
    }
  }, [dxfText])

  useEffect(() => {
    if (!groupRef.current) return

    // Fit camera to bounding box
    const box = new THREE.Box3().setFromObject(groupRef.current)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)

    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 45
    const fovRad = (fov * Math.PI) / 180
    const dist = (maxDim / 2) / Math.tan(fovRad / 2) * 1.5

    camera.position.set(center.x, center.y, center.z + dist)
    camera.lookAt(center)
    camera.updateProjectionMatrix()

    onBoundsChange({
      w: parseFloat(size.x.toFixed(2)),
      h: parseFloat(size.y.toFixed(2)),
      d: parseFloat(size.z.toFixed(2)),
    })

    return () => {
      // Dispose all geometries and materials on unmount
      group.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) {
          ;(obj as THREE.Mesh).geometry.dispose()
        }
        if ((obj as THREE.Mesh).material) {
          const mat = (obj as THREE.Mesh).material
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose())
          } else {
            ;(mat as THREE.Material).dispose()
          }
        }
      })
    }
  }, [group, camera, onBoundsChange])

  return <primitive ref={groupRef} object={group} />
}

// ---------------------------------------------------------------------------
// Spinner — used outside Canvas
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: '3px solid var(--bg-border)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BlockViewer
// ---------------------------------------------------------------------------

export function BlockViewer({ block, dxfText, onBoundsChange }: BlockViewerProps) {
  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: 280,
    background: 'var(--bg-raised)',
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const placeholderStyle: React.CSSProperties = {
    color: 'var(--text-dim)',
    fontSize: 13,
    textAlign: 'center',
    padding: '0 16px',
    fontFamily: 'var(--font-body)',
  }

  const hintStyle: React.CSSProperties = {
    marginTop: 6,
    fontSize: 11,
    color: 'var(--text-dim)',
    textAlign: 'center',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.02em',
  }

  // No block selected
  if (!block) {
    return (
      <div>
        <div style={containerStyle}>
          <span style={placeholderStyle}>Select a block to preview</span>
        </div>
      </div>
    )
  }

  // Loading (dxfText === undefined means fetch in progress)
  if (dxfText === undefined) {
    return (
      <div>
        <div style={containerStyle}>
          <Spinner />
        </div>
        <p style={hintStyle}>Loading preview&hellip;</p>
      </div>
    )
  }

  // Fetch returned null — no DXF available
  if (dxfText === null) {
    return (
      <div>
        <div style={containerStyle}>
          <span style={placeholderStyle}>Preview not available for<br /><strong>{block.name}</strong></span>
        </div>
      </div>
    )
  }

  // We have DXF text — render the 3-D canvas
  return (
    <div>
      <div style={containerStyle}>
        <Canvas
          style={{ width: '100%', height: '100%' }}
          frameloop="demand"
          camera={{ fov: 45, near: 0.1, far: 10000, position: [0, 0, 10] }}
        >
          {/* scene background set via Canvas style, not scene.background */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 10, 5]} intensity={0.8} />
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.05}
            autoRotate={false}
          />
          <gridHelper args={[100, 20, '#333333', '#333333']} />
          <Suspense fallback={null}>
            <DxfScene dxfText={dxfText} onBoundsChange={onBoundsChange} />
          </Suspense>
        </Canvas>
      </div>
      <p style={hintStyle}>Drag to rotate &middot; Scroll to zoom &middot; Right-drag to pan</p>
    </div>
  )
}
