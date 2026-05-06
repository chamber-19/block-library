import React from 'react'

interface SyncProgress {
  done: number
  total: number
  currentCategory: string
}

interface SyncStatusProps {
  lastSynced: string | null
  syncing: boolean
  syncProgress: SyncProgress | null
  onSync: () => void
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function SyncStatus({ lastSynced, syncing, syncProgress, onSync }: SyncStatusProps) {
  const progressPct =
    syncProgress && syncProgress.total > 0
      ? Math.round((syncProgress.done / syncProgress.total) * 100)
      : 0

  return (
    <div
      style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--bg-border)',
      }}
    >
      {syncing && syncProgress && (
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              marginBottom: 4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {syncProgress.done} / {syncProgress.total} — {syncProgress.currentCategory}
          </div>
          <div
            style={{
              height: 3,
              background: 'var(--bg-border)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPct}%`,
                background: 'var(--accent)',
                borderRadius: 2,
                transition: 'width 0.2s ease',
              }}
            />
          </div>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {lastSynced ? relativeTime(lastSynced) : 'Never synced'}
        </span>
        <button
          onClick={onSync}
          disabled={syncing}
          title="Sync catalog"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'none',
            border: '1px solid var(--bg-border)',
            borderRadius: 4,
            padding: '4px 8px',
            cursor: syncing ? 'not-allowed' : 'pointer',
            color: syncing ? 'var(--text-dim)' : 'var(--text)',
            fontSize: 11,
            fontFamily: 'var(--font-body)',
            opacity: syncing ? 0.5 : 1,
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              animation: syncing ? 'spin 1s linear infinite' : 'none',
            }}
          >
            <path
              d="M9.5 5.5A4 4 0 1 1 5.5 1.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
            <polyline
              points="5.5,1.5 7.5,1.5 7.5,3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          {syncing ? 'Syncing…' : 'Sync'}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
