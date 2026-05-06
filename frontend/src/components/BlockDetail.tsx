import React from 'react'

interface BlockMeta {
  id: string
  name: string
  categoryId: string
  driveFileId: string
  fileName: string
  lastModified: string | null
}

interface Category {
  id: string
  name: string
  driveId: string
  blockCount: number
  lastSynced: string | null
}

interface Dims {
  w: number
  h: number
  d: number
}

interface BlockDetailProps {
  block: BlockMeta | null
  category: Category | null
  dims: Dims | null
  onOpenInAutocad: () => void
}

const CATEGORY_COLORS: Record<string, string> = {
  'Relay Panels':       '#4a9eff',
  'Schematic':          '#6c5ce7',
  'Wiring':             '#00cec9',
  'Grounding':          '#fd79a8',
  'Conduit':            '#fdcb6e',
  'One-Line':           '#e17055',
  'Vendor':             '#00b894',
  'Logic':              '#a29bfe',
  'Structural':         '#fd79a8',
  'Equipment':          '#fdcb6e',
  'Drafting Standards': '#00cec9',
  'Stamps':             '#6c5ce7',
  'Logos':              '#4a9eff',
}

function categoryColor(name: string): string {
  return CATEGORY_COLORS[name] ?? '#8A8680'
}

function formatLastModified(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export function BlockDetail({ block, category, dims, onOpenInAutocad }: BlockDetailProps) {
  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 3,
  }

  if (!block) {
    return (
      <div
        style={{
          padding: 16,
          color: 'var(--text-dim)',
          fontSize: 13,
          fontFamily: 'var(--font-body)',
        }}
      >
        No block selected.
      </div>
    )
  }

  const dotColor = category ? categoryColor(category.name) : '#8A8680'

  return (
    <div
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Block name */}
      <div>
        <p style={sectionLabel}>Block</p>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 15,
            color: 'var(--text)',
            fontWeight: 600,
            lineHeight: 1.3,
            wordBreak: 'break-word',
          }}
        >
          {block.name}
        </p>
      </div>

      {/* File name */}
      <div>
        <p style={sectionLabel}>File</p>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-dim)',
            wordBreak: 'break-all',
          }}
        >
          {block.fileName}
        </p>
      </div>

      {/* Category */}
      {category && (
        <div>
          <p style={sectionLabel}>Category</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: dotColor,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{category.name}</span>
          </div>
        </div>
      )}

      {/* Dimensions */}
      {dims && (dims.w > 0 || dims.h > 0 || dims.d > 0) && (
        <div>
          <p style={sectionLabel}>Dimensions</p>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text)',
            }}
          >
            {dims.w} &times; {dims.h} &times; {dims.d}
          </p>
        </div>
      )}

      {/* Last modified */}
      <div>
        <p style={sectionLabel}>Last modified</p>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {formatLastModified(block.lastModified)}
        </p>
      </div>

      {/* Open in AutoCAD button */}
      <button
        onClick={onOpenInAutocad}
        disabled={!block}
        style={{
          marginTop: 4,
          padding: '9px 16px',
          background: 'var(--accent)',
          color: '#1C1B19',
          border: 'none',
          borderRadius: 5,
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '0.02em',
          opacity: block ? 1 : 0.4,
          transition: 'opacity 0.12s, filter 0.12s',
        }}
        onMouseEnter={(e) => {
          if (block) {
            ;(e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)'
          }
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)'
        }}
      >
        Open in AutoCAD
      </button>
    </div>
  )
}
