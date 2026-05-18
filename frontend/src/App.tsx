import React, { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { CategorySidebar } from './components/CategorySidebar'
import { BlockGrid } from './components/BlockGrid'
import { BlockViewer } from './components/BlockViewer'
import { BlockDetail } from './components/BlockDetail'

// ---------------------------------------------------------------------------
// isTauri guard — required on every invoke()
// ---------------------------------------------------------------------------
const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// ---------------------------------------------------------------------------
// Types (match Rust structs exactly; Tauri converts snake_case → camelCase)
// ---------------------------------------------------------------------------

interface Category {
  id: string
  name: string
  driveId: string
  blockCount: number
  lastSynced: string | null
}

interface BlockMeta {
  id: string
  name: string
  categoryId: string
  driveFileId: string
  fileName: string
  lastModified: string | null
}

interface SyncResult {
  categoriesSynced: number
  blocksSynced: number
  errors: string[]
}

interface SyncProgress {
  done: number
  total: number
  currentCategory: string
}

interface Dims {
  w: number
  h: number
  d: number
}

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [categories, setCategories]             = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [blocks, setBlocks]                     = useState<BlockMeta[]>([])
  const [selectedBlock, setSelectedBlock]       = useState<BlockMeta | null>(null)
  // undefined = loading / fetching, null = no data / not loaded, string = loaded
  const [dxfText, setDxfText]                   = useState<string | null | undefined>(null)
  const [dxfError, setDxfError]                 = useState<string | null>(null)
  const [converting, setConverting]             = useState<boolean>(false)
  const [dims, setDims]                         = useState<Dims | null>(null)
  const [searchQuery, setSearchQuery]           = useState('')
  const [syncing, setSyncing]                   = useState(false)
  const [syncProgress, setSyncProgress]         = useState<SyncProgress | null>(null)
  const [blocksLoading, setBlocksLoading]       = useState(false)

  // Tracks the most recent in-flight DXF fetch so out-of-order responses
  // can be discarded if the user clicks a different block mid-load.
  const dxfReqIdRef = useRef(0)

  const debouncedSearch = useDebounce(searchQuery, 280)

  // ---------------------------------------------------------------------------
  // Load categories on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isTauri) return
    invoke<Category[]>('list_categories')
      .then(setCategories)
      .catch((err) => console.error('list_categories failed:', err))
  }, [])

  // ---------------------------------------------------------------------------
  // Listen for sync-progress events
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isTauri) return
    let unlisten: (() => void) | undefined

    listen<SyncProgress>('sync-progress', (event) => {
      setSyncProgress(event.payload)
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Category selection → load blocks
  // ---------------------------------------------------------------------------
  function handleSelectCategory(id: string) {
    const cat = categories.find((c) => c.id === id) ?? null
    setSelectedCategory(cat)
    setSelectedBlock(null)
    setDxfText(null)
    setDxfError(null)
    setConverting(false)
    setDims(null)
    setSearchQuery('')

    if (!cat || !isTauri) return
    setBlocksLoading(true)
    invoke<BlockMeta[]>('list_blocks', { categoryId: id })
      .then((result) => {
        setBlocks(result)
        setBlocksLoading(false)
      })
      .catch((err) => {
        console.error('list_blocks failed:', err)
        setBlocks([])
        setBlocksLoading(false)
      })
  }

  // ---------------------------------------------------------------------------
  // Block selection → fetch DXF (auto-converts DWG via sidecar in Rust)
  // ---------------------------------------------------------------------------
  function handleSelectBlock(block: BlockMeta) {
    setSelectedBlock(block)
    setDims(null)
    setDxfError(null)
    setDxfText(undefined) // loading state

    if (!isTauri) {
      setDxfText(null)
      return
    }

    const isDwg = block.fileName.toLowerCase().endsWith('.dwg')
    setConverting(isDwg) // optimistic — Rust may serve from cache instantly

    const reqId = ++dxfReqIdRef.current

    invoke<string>('get_block_dxf', { driveFileId: block.driveFileId })
      .then((text) => {
        if (dxfReqIdRef.current !== reqId) return // stale response
        setDxfText(text)
        setConverting(false)
      })
      .catch((err: unknown) => {
        if (dxfReqIdRef.current !== reqId) return
        const msg = typeof err === 'string' ? err : (err as Error)?.message ?? String(err)
        console.error('get_block_dxf failed:', msg)
        setDxfText(null)
        setDxfError(msg)
        setConverting(false)
      })
  }

  // ---------------------------------------------------------------------------
  // Search (debounced)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!debouncedSearch.trim()) return
    if (!isTauri) return

    invoke<BlockMeta[]>('search_blocks', { query: debouncedSearch })
      .then((result) => {
        setBlocks(result)
        setSelectedCategory(null)
      })
      .catch((err) => console.error('search_blocks failed:', err))
  }, [debouncedSearch])

  // Clear search results when query is empty
  useEffect(() => {
    if (debouncedSearch.trim() === '' && selectedCategory && isTauri) {
      invoke<BlockMeta[]>('list_blocks', { categoryId: selectedCategory.id })
        .then(setBlocks)
        .catch(console.error)
    }
  }, [debouncedSearch, selectedCategory])

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------
  function handleSync() {
    if (!isTauri || syncing) return
    setSyncing(true)
    setSyncProgress(null)

    invoke<SyncResult>('sync_catalog')
      .then((result) => {
        console.log(
          `Sync complete: ${result.categoriesSynced} categories, ${result.blocksSynced} blocks`
        )
        if (result.errors.length > 0) {
          console.warn('Sync errors:', result.errors)
        }
        return invoke<Category[]>('list_categories')
      })
      .then((cats) => {
        setCategories(cats)
        setSyncing(false)
        setSyncProgress(null)
      })
      .catch((err) => {
        console.error('sync_catalog failed:', err)
        setSyncing(false)
        setSyncProgress(null)
      })
  }

  // ---------------------------------------------------------------------------
  // Open in AutoCAD (uses external opener; works for both DXF and DWG)
  // ---------------------------------------------------------------------------
  function handleOpenInAutocad() {
    if (!selectedBlock || !isTauri) return
    invoke('open_block_in_autocad', {
      driveFileId: selectedBlock.driveFileId,
      fileName: selectedBlock.fileName,
    }).catch((err) => console.error('open_block_in_autocad failed:', err))
  }

  // ---------------------------------------------------------------------------
  // Bounds change from viewer
  // ---------------------------------------------------------------------------
  const handleBoundsChange = useCallback((d: Dims) => {
    setDims(d)
  }, [])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Left sidebar — 220px fixed */}
      <CategorySidebar
        categories={categories}
        selectedId={selectedCategory?.id ?? null}
        onSelect={handleSelectCategory}
        onSync={handleSync}
        syncing={syncing}
        syncProgress={syncProgress}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
      />

      {/* Center — block grid, scrollable, flex */}
      <BlockGrid
        blocks={blocks}
        selectedBlock={selectedBlock}
        onSelect={handleSelectBlock}
        category={selectedCategory}
        loading={blocksLoading}
      />

      {/* Right panel — 420px fixed (wider to accommodate viewer toolbar) */}
      <aside
        style={{
          width: 420,
          flexShrink: 0,
          borderLeft: '1px solid var(--bg-border)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          background: 'var(--bg)',
        }}
      >
        {/* Viewer (2D / 3D) */}
        <div style={{ padding: 12, flexShrink: 0 }}>
          <BlockViewer
            block={selectedBlock}
            dxfText={dxfText}
            converting={converting}
            errorMessage={dxfError}
            onBoundsChange={handleBoundsChange}
          />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--bg-border)', flexShrink: 0 }} />

        {/* Block detail — scrollable if content overflows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <BlockDetail
            block={selectedBlock}
            category={selectedCategory}
            dims={dims}
            onOpenInAutocad={handleOpenInAutocad}
          />
        </div>
      </aside>
    </div>
  )
}
