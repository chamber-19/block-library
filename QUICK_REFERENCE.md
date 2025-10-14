# Quick Reference Guide

## 🚀 Start the System

### Web App Only
```bash
npm run dev
# Open http://localhost:5173
```

### Web + Python Backend
```bash
# Terminal 1
npm run dev

# Terminal 2
python server/enhanced_api_bridge.py
```

### Full System with Services
```bash
# Terminal 1
npm run dev

# Terminal 2
python server/service_manager.py

# Terminal 3 (optional)
python server/app.py
```

## 📁 Important Files

### Configuration
- `.env` - Supabase credentials (already set)
- `config/library.yaml` - Library folders
- `config/services.yaml` - Service configuration (create if needed)

### Python Backend
- `server/run_accore.py` - AutoCAD Core runner
- `server/thumb_nailer.py` - Thumbnail generator
- `server/indexer.py` - SQLite indexing
- `server/service_manager.py` - Service orchestrator
- `server/enhanced_api_bridge.py` - Enhanced REST API

### Web Frontend
- `src/App.tsx` - Main app
- `src/components/Dashboard.tsx` - Dashboard view
- `src/components/BlockLibrary.tsx` - Library browser
- `src/components/GridViewer.tsx` - 3D viewer

## 🔧 Common Commands

### Development
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run typecheck    # Check TypeScript
npm run lint         # Lint code
```

### Python Services
```bash
# Service manager
python server/service_manager.py                # Run all services
python server/service_manager.py --list         # List services
python server/service_manager.py --status       # Show status

# API bridge
python server/enhanced_api_bridge.py            # Start API
python server/enhanced_api_bridge.py --port 8080 # Custom port

# Desktop app
python server/app.py                            # Launch desktop UI
```

### AutoCAD Core Operations
```bash
# List blocks
python server/run_accore.py file.dwg blocks output.json

# Get curves
python server/run_accore.py file.dwg curves BlockName output.json

# Get tags
python server/run_accore.py file.dwg tags BlockName output.json

# Batch plot
python server/run_accore.py file.dwg plot output_folder
```

## 🌐 API Endpoints

### Health & Status
```
GET  /                    # API info
GET  /health             # Health check
GET  /stats              # Statistics
```

### DWG Processing
```
POST /api/dwg/process              # Upload & process DWG
GET  /api/dwg/blocks/{filename}    # List blocks
GET  /api/dwg/curves/{filename}/{blockname}  # Get curves
```

### Thumbnails
```
POST /api/thumbnails/generate      # Generate thumbnail
GET  /api/thumbnails/{filename}    # Get cached thumbnail
GET  /api/thumbnails/cache         # List cache
DELETE /api/thumbnails/cache       # Clear cache
```

### Search
```
GET  /api/search/blocks?query=...  # Search blocks
GET  /api/search/files?query=...   # Search files
```

### Files
```
GET  /api/files/scan?root_path=... # Scan directory
POST /api/files/sync               # Sync to database
```

### WebSocket
```
WS   /ws                           # Real-time notifications
```

## 🗄️ Database

### Supabase (PostgreSQL)
```sql
-- Categories
SELECT * FROM categories;

-- Blocks
SELECT * FROM blocks WHERE category_id = ?;

-- Recent files
SELECT * FROM recent_files ORDER BY opened_at DESC;
```

### SQLite (Local Index)
```sql
-- File location (default)
%LOCALAPPDATA%\BlockLibrary\index.db  # Windows
~/.local/share/BlockLibrary/index.db  # Linux

-- Query blocks
SELECT * FROM blocks WHERE name LIKE '%relay%';

-- Query files
SELECT * FROM files WHERE path LIKE '%.dwg';
```

## 🔑 Environment Variables

```bash
# AutoCAD Core
ACCORE=C:\Program Files\Autodesk\AutoCAD 2026\accoreconsole.exe
CAD_HEADLESS_DLL=C:\path\to\CadHeadless.dll
ACC_DEBUG=0

# Database
BLOCKLIB_DB=C:\Users\YourName\AppData\Local\BlockLibrary\index.db

# Supabase (in .env file)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## 📊 Service Ports

- **Web App**: http://localhost:5173
- **API Bridge**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **WebSocket**: ws://localhost:8000/ws

## 🐛 Troubleshooting

### Web app won't start
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Python errors
```bash
pip install --upgrade fastapi uvicorn PySide6 pyyaml watchdog
```

### Database connection issues
Check `.env` file has correct Supabase credentials

### AutoCAD Core not found
Set ACCORE environment variable to correct path

### Thumbnails not generating
- Ensure PySide6 is installed
- Check CAD_HEADLESS_DLL is set correctly
- Verify DWG file is valid

### Port already in use
```bash
npx kill-port 5173  # or 8000
```

## 📚 Documentation Files

1. **QUICK_REFERENCE.md** ← You are here
2. **QUICKSTART.md** - 5-minute setup
3. **README.md** - Complete documentation
4. **ARCHITECTURE.md** - System architecture
5. **INTEGRATION.md** - Integration scenarios
6. **FEATURES.md** - Feature catalog
7. **FINAL_SUMMARY.md** - Comprehensive summary

## 🎯 Quick Tasks

### Add a new category
```typescript
// In web app
import { BlockService } from './lib/blockService';
await BlockService.createCategory('My Category', '#ff6b6b', '🔥');
```

### Add library folders
```python
# In desktop app or Python
from library_config import LibraryConfig
cfg = LibraryConfig('config/library.yaml')
cfg.add_folder('My Library', 'C:/path/to/library')
```

### Trigger indexing
```bash
curl -X POST http://localhost:8000/api/index/trigger \
  -H "Content-Type: application/json" \
  -d '{"roots": ["C:/Library/Panels"]}'
```

### Generate thumbnail
```bash
curl -X POST http://localhost:8000/api/thumbnails/generate \
  -F "file=@block.dwg" \
  -F "size=256"
```

## 🔄 Common Workflows

### Import new DWG library
1. Add folder via Roots Manager (desktop) or API
2. Trigger indexing: `POST /api/index/trigger`
3. Generate thumbnails: batch POST to `/api/thumbnails/generate`
4. View in web app automatically

### Search for blocks
1. Web app: Use search bar
2. API: `GET /api/search/blocks?query=relay`
3. Desktop: Use tree view filter

### Open block in viewer
1. Click block card in web library
2. Opens Grid Viewer with 3D representation
3. View metadata in sidebar

## 💡 Tips

- Use `Ctrl+Shift+R` in browser to force refresh
- Check `/health` endpoint for system status
- Monitor `/ws` for real-time events
- Clear cache if thumbnails look wrong
- Use `--reload` flag for API development
- Check console logs for debugging

---

**For detailed information, see the full documentation files.**
