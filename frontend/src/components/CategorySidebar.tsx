import React from 'react'
import { SearchBar } from './SearchBar'
import { SyncStatus } from './SyncStatus'

interface Category {
  id: string
  name: string
  driveId: string
  blockCount: number
  lastSynced: string | null
}

interface SyncProgress {
  done: number
  total: number
  currentCategory: string
}

interface CategorySidebarProps {
  categories: Category[]
  selectedId: string | null
  onSelect: (id: string) => void
  onSync: () => void
  syncing: boolean
  syncProgress: SyncProgress | null
  searchQuery: string
  onSearch: (v: string) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  'Relay Panels':      '#4a9eff',
  'Schematic':         '#6c5ce7',
  'Wiring':            '#00cec9',
  'Grounding':         '#fd79a8',
  'Conduit':           '#fdcb6e',
  'One-Line':          '#e17055',
  'Vendor':            '#00b894',
  'Logic':             '#a29bfe',
  'Structural':        '#fd79a8',
  'Equipment':         '#fdcb6e',
  'Drafting Standards':'#00cec9',
  'Stamps':            '#6c5ce7',
  'Logos':             '#4a9eff',
}

function categoryColor(name: string): string {
  return CATEGORY_COLORS[name] ?? '#8A8680'
}

// The last-synced shown in the sidebar footer is the most-recent across all categories
function latestSync(categories: Category[]): string | null {
  const dates = categories
    .map((c) => c.lastSynced)
    .filter(Boolean) as string[]
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (a > b ? a : b))
}

export function CategorySidebar({
  categories,
  selectedId,
  onSelect,
  onSync,
  syncing,
  syncProgress,
  searchQuery,
  onSearch,
}: CategorySidebarProps) {
  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--bg-raised)',
        borderRight: '1px solid var(--bg-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* App name */}
      <div
        style={{
          padding: '18px 16px 10px',
          borderBottom: '1px solid var(--bg-border)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            color: 'var(--accent)',
            fontWeight: 400,
            lineHeight: 1.2,
          }}
        >
          Block Library
        </h1>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 16px 0' }}>
        <SearchBar
          value={searchQuery}
          onChange={onSearch}
          placeholder="Search blocks…"
        />
      </div>

      {/* Category list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 0',
        }}
      >
        {categories.length === 0 && (
          <p
            style={{
              padding: '12px 16px',
              fontSize: 12,
              color: 'var(--text-dim)',
            }}
          >
            No categories loaded.
          </p>
        )}
        {categories.map((cat) => {
          const isSelected = cat.id === selectedId
          const dot = categoryColor(cat.name)
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                background: isSelected ? 'var(--accent-dim)' : 'transparent',
                border: 'none',
                borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                cursor: 'pointer',
                padding: '8px 14px',
                gap: 8,
                textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  ;(e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(255,255,255,0.04)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                }
              }}
            >
              {/* Color dot */}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: dot,
                  flexShrink: 0,
                }}
              />
              {/* Name */}
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: isSelected ? 'var(--text)' : 'var(--text-dim)',
                  fontWeight: isSelected ? 600 : 400,
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {cat.name}
              </span>
              {/* Count badge */}
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-dim)',
                  background: 'var(--bg-border)',
                  borderRadius: 10,
                  padding: '1px 6px',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                }}
              >
                {cat.blockCount}
              </span>
            </button>
          )
        })}
      </div>

      {/* Sync status footer */}
      <SyncStatus
        lastSynced={latestSync(categories)}
        syncing={syncing}
        syncProgress={syncProgress}
        onSync={onSync}
      />
    </aside>
  )
}
