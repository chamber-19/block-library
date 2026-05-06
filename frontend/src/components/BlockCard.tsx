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

type CardSize = 'compact' | 'medium' | 'large'

interface BlockCardProps {
  block: BlockMeta
  category: Category | null
  selected: boolean
  cardSize: CardSize
  onClick: () => void
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

const CARD_HEIGHTS: Record<CardSize, number> = {
  compact: 80,
  medium: 120,
  large: 160,
}

// Simple DXF placeholder icon — a square with an X inside
function DxfIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.35 }}
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="3"
        y1="3"
        x2="21"
        y2="21"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="21"
        y1="3"
        x2="3"
        y2="21"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BlockCard({ block, category, selected, cardSize, onClick }: BlockCardProps) {
  const height = CARD_HEIGHTS[cardSize]
  const dotColor = category ? categoryColor(category.name) : '#8A8680'
  const iconSize = cardSize === 'compact' ? 20 : cardSize === 'medium' ? 28 : 36

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height,
        padding: '8px 10px',
        background: selected ? 'var(--accent-dim)' : 'var(--bg-raised)',
        border: selected
          ? '1px solid var(--accent)'
          : '1px solid var(--bg-border)',
        borderRadius: 6,
        cursor: 'pointer',
        gap: 6,
        textAlign: 'center',
        width: '100%',
        overflow: 'hidden',
        transition: 'filter 0.1s, border-color 0.1s, background 0.1s',
        color: 'var(--text)',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          ;(e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)'
        }
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)'
      }}
    >
      {/* Placeholder icon */}
      <DxfIcon size={iconSize} />

      {/* Block name */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: cardSize === 'compact' ? 10 : 12,
          lineHeight: 1.3,
          color: selected ? 'var(--text)' : 'var(--text-dim)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
          display: 'block',
        }}
      >
        {block.name}
      </span>

      {/* Category color dot — hide on compact to save space */}
      {cardSize !== 'compact' && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
          }}
        />
      )}
    </button>
  )
}
