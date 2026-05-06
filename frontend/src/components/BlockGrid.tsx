import React, { useState } from 'react'
import { BlockCard } from './BlockCard'

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

interface BlockGridProps {
  blocks: BlockMeta[]
  selectedBlock: BlockMeta | null
  onSelect: (block: BlockMeta) => void
  category: Category | null
  loading: boolean
}

const COLUMNS: Record<CardSize, number> = {
  compact: 6,
  medium: 4,
  large: 3,
}

function SkeletonCard({ height }: { height: number }) {
  return (
    <div
      style={{
        height,
        background: 'var(--bg-raised)',
        border: '1px solid var(--bg-border)',
        borderRadius: 6,
        animation: 'pulse 1.4s ease-in-out infinite',
      }}
    />
  )
}

export function BlockGrid({
  blocks,
  selectedBlock,
  onSelect,
  category,
  loading,
}: BlockGridProps) {
  const [cardSize, setCardSize] = useState<CardSize>('medium')

  const cols = COLUMNS[cardSize]
  const skeletonHeight = cardSize === 'compact' ? 80 : cardSize === 'medium' ? 120 : 160

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px 10px',
          borderBottom: '1px solid var(--bg-border)',
          flexShrink: 0,
          gap: 12,
        }}
      >
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Block Library
          </span>
          {category && (
            <>
              <span style={{ color: 'var(--bg-border)', fontSize: 12 }}>/</span>
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--text)',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {category.name}
              </span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {/* Block count */}
          {!loading && category && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {blocks.length} block{blocks.length !== 1 ? 's' : ''}
            </span>
          )}

          {/* Card size toggle */}
          <div
            style={{
              display: 'flex',
              border: '1px solid var(--bg-border)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            {(['compact', 'medium', 'large'] as CardSize[]).map((s) => (
              <button
                key={s}
                onClick={() => setCardSize(s)}
                title={s.charAt(0).toUpperCase() + s.slice(1)}
                style={{
                  background: cardSize === s ? 'var(--accent-dim)' : 'transparent',
                  border: 'none',
                  borderRight: s !== 'large' ? '1px solid var(--bg-border)' : 'none',
                  color: cardSize === s ? 'var(--accent)' : 'var(--text-dim)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {s === 'compact' ? 'S' : s === 'medium' ? 'M' : 'L'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: 10,
            }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonCard key={i} height={skeletonHeight} />
            ))}
          </div>
        ) : blocks.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-dim)',
              fontSize: 13,
            }}
          >
            {category
              ? 'No blocks in this category yet.'
              : 'Select a category to browse blocks.'}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: 10,
            }}
          >
            {blocks.map((block) => (
              <BlockCard
                key={block.id}
                block={block}
                category={category}
                selected={selectedBlock?.id === block.id}
                cardSize={cardSize}
                onClick={() => onSelect(block)}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
