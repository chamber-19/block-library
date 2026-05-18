import React, { useCallback, useState } from 'react'
import { Viewer2D } from './Viewer2D'
import { Viewer3D } from './Viewer3D'
import { ViewerToolbar, type ViewerMode } from './ViewerToolbar'

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
  /** True while a DWG is being auto-converted to DXF via the sidecar. */
  converting?: boolean
  /** Optional message returned when conversion failed or is unavailable. */
  errorMessage?: string | null
  onBoundsChange: (dims: Dims) => void
}

const VIEWER_HEIGHT = 320

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: VIEWER_HEIGHT,
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
  lineHeight: 1.45,
}

const hintStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  color: 'var(--text-dim)',
  textAlign: 'center',
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.02em',
}

function Spinner({ label }: { label?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: '3px solid var(--bg-border)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      {label ? <span style={{ ...placeholderStyle, fontSize: 11 }}>{label}</span> : null}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export function BlockViewer({
  block,
  dxfText,
  converting,
  errorMessage,
  onBoundsChange,
}: BlockViewerProps) {
  const [mode, setMode] = useState<ViewerMode>('2d')
  const [showGrid, setShowGrid] = useState<boolean>(true)
  const [autoRotate, setAutoRotate] = useState<boolean>(false)
  const [fitNonce, setFitNonce] = useState<number>(0)
  const [layers, setLayers] = useState<string[]>([])

  const handleFit = useCallback(() => setFitNonce((n) => n + 1), [])
  const handleLayers = useCallback((next: string[]) => setLayers(next), [])

  // -------------------------------------------------------------------------
  // No block selected
  // -------------------------------------------------------------------------
  if (!block) {
    return (
      <div>
        <div style={containerStyle}>
          <span style={placeholderStyle}>Select a block to preview</span>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // DWG conversion in progress
  // -------------------------------------------------------------------------
  if (converting) {
    return (
      <div>
        <div style={containerStyle}>
          <Spinner label="Converting DWG → DXF…" />
        </div>
        <p style={hintStyle}>Running embedded ODA sidecar</p>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Loading (dxfText === undefined means fetch in progress)
  // -------------------------------------------------------------------------
  if (dxfText === undefined) {
    return (
      <div>
        <div style={containerStyle}>
          <Spinner label="Loading preview…" />
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Conversion failed or DXF unavailable
  // -------------------------------------------------------------------------
  if (dxfText === null) {
    return (
      <div>
        <div style={containerStyle}>
          <span style={placeholderStyle}>
            {errorMessage ? (
              <>
                {errorMessage}
                <br />
                <strong style={{ color: 'var(--text)' }}>{block.name}</strong>
              </>
            ) : (
              <>
                Preview not available for
                <br />
                <strong style={{ color: 'var(--text)' }}>{block.name}</strong>
              </>
            )}
          </span>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render — pick the active viewer based on mode.
  // -------------------------------------------------------------------------

  const hint =
    layers.length > 0
      ? `${layers.length} layer${layers.length === 1 ? '' : 's'}`
      : undefined

  return (
    <div>
      <ViewerToolbar
        mode={mode}
        onModeChange={setMode}
        showGrid={showGrid}
        onGridToggle={() => setShowGrid((g) => !g)}
        autoRotate={autoRotate}
        onAutoRotateToggle={() => setAutoRotate((r) => !r)}
        onFit={handleFit}
        hint={hint}
      />
      <div style={containerStyle}>
        {mode === '2d' ? (
          <Viewer2D
            dxfText={dxfText}
            showGrid={showGrid}
            fitNonce={fitNonce}
            onBoundsChange={onBoundsChange}
            onLayersChange={handleLayers}
          />
        ) : (
          <Viewer3D
            dxfText={dxfText}
            showGrid={showGrid}
            autoRotate={autoRotate}
            fitNonce={fitNonce}
            onBoundsChange={onBoundsChange}
            onLayersChange={handleLayers}
          />
        )}
      </div>
      <p style={hintStyle}>
        {mode === '2d'
          ? 'Drag to pan · Scroll to zoom · F to fit'
          : 'Drag to orbit · Right-drag to pan · Scroll to zoom'}
      </p>
    </div>
  )
}
