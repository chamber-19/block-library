# Project Structure Guide

## Overview

This document describes the reorganized folder structure of the Hyphae Block Library project.

## Directory Structure

```
Projects/Hyphae-Block-Library/
│
├── src/                          # React Web Frontend
│   ├── components/
│   │   ├── viewers/              # 3D/2D viewers
│   │   │   ├── AdvancedViewer.tsx
│   │   │   ├── GridViewer.tsx
│   │   │   └── ComparisonView.tsx
│   │   ├── library/              # Library browsing
│   │   │   └── BlockLibrary.tsx
│   │   ├── dashboard/            # Dashboard components
│   │   │   └── Dashboard.tsx
│   │   ├── operations/           # Bulk operations
│   │   │   ├── BulkOperations.tsx
│   │   │   ├── DragDropUpload.tsx
│   │   │   └── HistoryViewer.tsx
│   │   └── common/               # Shared components
│   │       ├── SplashScreen.tsx
│   │       ├── Tooltip.tsx
│   │       ├── EmptyState.tsx
│   │       ├── LoadingCard.tsx
│   │       ├── ProgressBar.tsx
│   │       ├── SkeletonLoader.tsx
│   │       ├── EnhancedSearch.tsx
│   │       └── VirtualList.tsx
│   ├── lib/
│   │   ├── services/             # API/data services
│   │   │   ├── blockService.ts
│   │   │   └── thumbnailService.ts
│   │   ├── supabase.ts
│   │   ├── responsive.ts
│   │   └── utils.ts
│   ├── contexts/                 # React contexts
│   │   ├── ThemeContext.tsx
│   │   └── UndoRedoContext.tsx
│   ├── dev/                      # Development utilities
│   │   ├── ErrorBoundary.tsx
│   │   └── consoleCapture.ts
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   └── vite-env.d.ts
│
├── server/                       # Python Backend
│   ├── core/                     # Core functionality
│   │   ├── run_accore.py         # AutoCAD Core wrapper
│   │   ├── indexer.py            # SQLite indexing
│   │   ├── library_config.py     # Configuration
│   │   └── roots_manager.py      # Root folder management
│   ├── services/                 # Business logic
│   │   └── thumb_nailer.py       # Thumbnail generation
│   ├── ui/                       # Desktop UI (PySide6)
│   │   ├── windows/              # Main windows
│   │   │   ├── app.py            # Entry point
│   │   │   ├── dashboard_layout.py
│   │   │   ├── block_library_layout.py
│   │   │   └── mini_block_viewer.py
│   │   └── widgets/              # Reusable widgets
│   │       ├── preview_widget.py
│   │       ├── grid_viewer.py
│   │       └── accore_worker.py
│   ├── api/                      # REST API (FastAPI)
│   │   ├── enhanced_api_bridge.py
│   │   ├── routes/               # API endpoints (future)
│   │   └── models/               # Pydantic models (future)
│   ├── utils/                    # Utilities (future)
│   ├── service_manager.py        # Service orchestration
│   └── __init__.py
│
├── database/                     # Database schemas
│   ├── schema.sql
│   ├── migrations/               # Future migrations
│   └── seeds/                    # Sample data
│
├── config/                       # Configuration files
│   └── library.yaml
│
├── tests/                        # Tests (future)
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/                         # Documentation
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── SETUP.md
│   └── DEVELOPMENT.md
│
├── tools/                        # Build/dev tools
│   └── scripts/
│
├── requirements.txt              # Python dependencies
├── package.json                  # Node dependencies
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite config
├── index.html                    # HTML entry point
├── README.md
└── STRUCTURE.md                  # This file
```

## Import Paths

### Frontend (React/TypeScript)
```typescript
// Viewers
import { AdvancedViewer } from './components/viewers/AdvancedViewer';
import { GridViewer } from './components/viewers/GridViewer';

// Library
import { BlockLibrary } from './components/library/BlockLibrary';

// Dashboard
import { Dashboard } from './components/dashboard/Dashboard';

// Operations
import { BulkOperations } from './components/operations/BulkOperations';

// Common
import { SplashScreen } from './components/common/SplashScreen';
import { Tooltip } from './components/common/Tooltip';

// Services
import { blockService } from './lib/services/blockService';
```

### Backend (Python)
```python
# Core
from server.core.run_accore import run_accore
from server.core.indexer import IndexerCore
from server.core.library_config import LibraryConfig

# Services
from server.services.thumb_nailer import ThumbnailWorker

# UI Windows
from server.ui.windows.app import main
from server.ui.windows.dashboard_layout import DashboardLayout

# UI Widgets
from server.ui.widgets.preview_widget import BlockPreviewWidget
from server.ui.widgets.accore_worker import AutoCADWorker

# API
from server.api.enhanced_api_bridge import app
```

## Key Changes

### Phase 1: Frontend Organization ✅
- Grouped components by feature (viewers, library, dashboard, operations)
- Created `lib/services/` for API/data services
- Created `types/` and `hooks/` directories (ready for use)

### Phase 2: Backend Organization ✅
- Separated concerns: core, services, UI, API
- UI split into windows (main apps) and widgets (reusable)
- Core functionality isolated in `server/core/`

### Phase 3: Infrastructure ✅
- Created `database/` for SQL schemas
- Created `config/` for YAML configurations
- Created `tests/` structure for future tests
- Created `docs/` for documentation

## Running the Application

### Frontend
```bash
cd Projects/Hyphae-Block-Library
npm install
npm run dev
```

### Backend (Desktop App)
```bash
cd Projects/Hyphae-Block-Library
pip install -r requirements.txt
python -m server.ui.windows.app
```

### API Bridge
```bash
python server/api/enhanced_api_bridge.py --port 8000
```

## Next Steps

1. **Update imports in components** - Ensure all relative imports work
2. **Add path aliases** - Configure `tsconfig.json` for cleaner imports
3. **Create tests** - Add unit/integration tests in `tests/` folder
4. **Add CI/CD** - GitHub Actions workflows
5. **Document APIs** - Add OpenAPI/Swagger documentation

## Notes

- All `__init__.py` files created for Python package structure
- Import paths updated in main entry points
- Backward compatibility maintained through fallback imports
- Git history preserved - all changes tracked

