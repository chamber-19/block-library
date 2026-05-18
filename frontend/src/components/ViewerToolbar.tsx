import React from 'react'

export type ViewerMode = '2d' | '3d'

interface ViewerToolbarProps {
  mode: ViewerMode
  onModeChange: (mode: ViewerMode) => void
  showGrid: boolean
  onGridToggle: () => void
  autoRotate: boolean
  onAutoRotateToggle: () => void
  onFit: () => void
  /** Optional banner shown beside the toolbar (e.g. layer/file info). */
  hint?: string
}

function btnStyle(active: boolean, disabled?: boolean): React.CSSProperties {
  return {
    height: 26,
    padding: '0 9px',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#1C1B19' : 'var(--text-dim)',
    border: '1px solid var(--bg-border)',
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    letterSpacing: '0.04em',
    transition: 'background 0.1s, color 0.1s',
  }
}

export function ViewerToolbar({
  mode,
  onModeChange,
  showGrid,
  onGridToggle,
  autoRotate,
  onAutoRotateToggle,
  onFit,
  hint,
}: ViewerToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 0',
        flexWrap: 'wrap',
      }}
    >
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 0, border: '1px solid var(--bg-border)', borderRadius: 4 }}>
        <button
          onClick={() => onModeChange('2d')}
          style={{
            ...btnStyle(mode === '2d'),
            border: 'none',
            borderRight: '1px solid var(--bg-border)',
            borderRadius: '4px 0 0 4px',
          }}
          title="Top-down 2D view"
        >
          2D
        </button>
        <button
          onClick={() => onModeChange('3d')}
          style={{
            ...btnStyle(mode === '3d'),
            border: 'none',
            borderRadius: '0 4px 4px 0',
          }}
          title="Perspective 3D view with orbit"
        >
          3D
        </button>
      </div>

      <button onClick={onFit} style={btnStyle(false)} title="Fit view to extents">
        FIT
      </button>

      <button
        onClick={onGridToggle}
        style={btnStyle(showGrid)}
        title="Toggle reference grid"
      >
        GRID
      </button>

      <button
        onClick={onAutoRotateToggle}
        style={btnStyle(autoRotate, mode === '2d')}
        disabled={mode === '2d'}
        title={mode === '2d' ? 'Auto-rotate is 3D only' : 'Toggle auto-rotate'}
      >
        SPIN
      </button>

      {hint ? (
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-dim)',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 200,
          }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  )
}
