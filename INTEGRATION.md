# Integration Guide: Web App + Python Desktop Application

This guide explains how to integrate the React web dashboard with your existing Python PySide6 desktop application for a unified block library management system.

## Overview

The system consists of three main components:

1. **React Web App** (this project) - Modern web interface
2. **Python Desktop App** (server/*.py) - PySide6 application with AutoCAD Core integration
3. **FastAPI Bridge** (api_bridge.py) - REST API connecting web and desktop

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        User Layer                             │
├────────────────────────┬─────────────────────────────────────┤
│   React Web Browser    │   Python Desktop Application        │
│   (localhost:5173)     │   (PySide6 Qt Application)          │
└───────────┬────────────┴──────────────┬──────────────────────┘
            │                           │
            │ HTTP/REST                 │ Direct
            │                           │
┌───────────▼───────────────────────────▼──────────────────────┐
│                    FastAPI Bridge Server                      │
│                    (localhost:8000)                           │
│                                                               │
│  • DWG Processing      • File System Ops                     │
│  • Thumbnail Gen       • Watch Service                       │
│  • AutoCAD Core Bridge • Database Sync                       │
└───────────┬───────────────────────────┬──────────────────────┘
            │                           │
            │                           │
┌───────────▼──────────┐    ┌───────────▼──────────────────────┐
│   Supabase Database  │    │   Local File System              │
│   • categories       │    │   • DWG files                    │
│   • blocks           │    │   • Thumbnails                   │
│   • recent_files     │    │   • Library folders              │
└──────────────────────┘    └──────────────────────────────────┘
```

## Setup Instructions

### 1. Database Setup (Already Complete)

The Supabase database is already configured with:
- `categories` table with default categories
- `blocks` table for block metadata
- `recent_files` table for activity tracking
- Row Level Security policies

### 2. Web App Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The web app will be available at `http://localhost:5173`

### 3. Python Desktop App (Existing)

Your Python application is already functional with:
- PySide6 UI (dashboard_layout.py)
- Block library browser (block_library_layout.py)
- 3D grid viewer (grid_viewer.py)
- AutoCAD Core worker (accore_worker.py)

No changes needed to the desktop app for basic operation.

### 4. API Bridge Setup (Optional but Recommended)

```bash
# Install Python dependencies
pip install fastapi uvicorn python-multipart supabase watchdog

# Start the bridge server
python api_bridge.py
```

The API bridge will be available at `http://localhost:8000`

## Integration Scenarios

### Scenario 1: Web-Only (Current State)

The web app works standalone using:
- Demo data for categories
- Supabase database for persistence
- Canvas-based 3D viewer

**Pros:**
- No Python dependencies
- Easy deployment
- Fast development

**Cons:**
- No real DWG processing
- No AutoCAD Core integration
- Limited file system access

### Scenario 2: Web + API Bridge (Recommended)

Web app communicates with Python backend via REST API:

```typescript
// In React component
const processDWG = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('http://localhost:8000/api/dwg/process', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  // result contains blocks, inserts, metadata
};
```

**Pros:**
- Full DWG processing
- AutoCAD Core integration
- Real thumbnail generation
- File system monitoring

**Cons:**
- Requires Python backend running
- CORS configuration needed
- More complex deployment

### Scenario 3: Desktop App Embeds Web (Hybrid)

Python app embeds web view using QWebEngineView:

```python
from PySide6.QtWebEngineWidgets import QWebEngineView

class HybridDashboard(QMainWindow):
    def __init__(self):
        super().__init__()
        self.web_view = QWebEngineView()
        self.web_view.load(QUrl("http://localhost:5173"))
        self.setCentralWidget(self.web_view)
```

**Pros:**
- Single application
- Native OS integration
- Full Python capabilities

**Cons:**
- Requires QtWebEngine
- Larger binary size
- More complex architecture

## Data Flow Examples

### 1. Opening a DWG File

**Web-Only:**
```
User selects category → Web app queries Supabase → Displays blocks
```

**With API Bridge:**
```
User uploads DWG → POST to /api/dwg/process → AutoCAD Core extracts data
→ Returns to web app → Saves to Supabase → Displays results
```

**Desktop App:**
```
User selects DWG → accore_worker processes → Populates Qt tree widget
→ Displays in preview_widget
```

### 2. Generating Thumbnails

**Web-Only:**
```
Use placeholder icons based on category
```

**With API Bridge:**
```
Upload DWG → API bridge processes → Renders to PNG → Stores in Supabase Storage
→ Returns URL → Web app displays
```

**Desktop App:**
```
ThumbnailWorker processes DWG → Saves to cache folder → Updates icon_list
```

### 3. File System Monitoring

**Web-Only:**
```
Manual refresh/sync
```

**With API Bridge:**
```
Watchdog monitors folders → Detects changes → Triggers indexing
→ Updates database → WebSocket notifies web app → UI updates
```

**Desktop App:**
```
_AccoreAutoPoster watches folders → Detects DWG changes
→ Runs accore_worker → Updates internal state
```

## API Bridge Endpoints

### DWG Processing

```
POST   /api/dwg/process
GET    /api/dwg/blocks/{filename}
GET    /api/dwg/curves/{filename}/{blockname}
```

### File System

```
GET    /api/files/scan?root_path=/path/to/library
POST   /api/files/sync?root_path=/path&category_id=uuid
```

### Thumbnails

```
POST   /api/thumbnails/generate
```

### Health & Status

```
GET    /
GET    /health
GET    /api/watch/status
```

## Environment Configuration

### Web App (.env)
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_BRIDGE_URL=http://localhost:8000  # Optional
```

### API Bridge
```bash
export VITE_SUPABASE_URL=your_supabase_url
export VITE_SUPABASE_ANON_KEY=your_anon_key
```

### Desktop App (config/library.yaml)
```yaml
folders:
  - name: "Relay Panels"
    path: "/path/to/panels"
  - name: "Schematic"
    path: "/path/to/schematics"
```

## Real-Time Sync

To enable real-time synchronization between web and desktop:

### 1. WebSocket in Web App

```typescript
import { supabase } from './lib/supabase';

// Subscribe to block changes
const subscription = supabase
  .channel('blocks_changes')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'blocks' },
    (payload) => {
      console.log('Block changed:', payload);
      // Update UI
    }
  )
  .subscribe();
```

### 2. Python Desktop Updates Database

```python
from supabase import create_client

supabase = create_client(supabase_url, supabase_key)

# When a block is modified
supabase.table('blocks').update({
    'last_modified': datetime.now().isoformat(),
    'metadata': {...}
}).eq('id', block_id).execute()
```

### 3. Both Apps Stay in Sync

Web app and desktop app both receive updates via Supabase Realtime.

## Deployment Options

### Web App

**Option 1: Static Hosting (Vercel, Netlify)**
```bash
npm run build
# Deploy dist/ folder
```

**Option 2: Docker**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 5173
CMD ["npm", "run", "preview"]
```

### API Bridge

**Option 1: Systemd Service (Linux)**
```ini
[Unit]
Description=Block Library API Bridge
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/project
ExecStart=/usr/bin/python3 api_bridge.py
Restart=always

[Install]
WantedBy=multi-user.target
```

**Option 2: Docker**
```dockerfile
FROM python:3.11
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "api_bridge.py"]
```

### Desktop App

**Option 1: PyInstaller**
```bash
pip install pyinstaller
pyinstaller --onefile --windowed server/app.py
```

**Option 2: Docker (for Linux)**
```dockerfile
FROM python:3.11
RUN apt-get update && apt-get install -y \
    qtbase5-dev \
    qttools5-dev \
    libqt5widgets5
COPY . /app
WORKDIR /app
RUN pip install -r requirements.txt
CMD ["python", "server/app.py"]
```

## Troubleshooting

### CORS Errors (Web → API Bridge)

Add your web app URL to CORS allowed origins:

```python
# In api_bridge.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://your-production-domain.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Database Connection Issues

Check Supabase credentials:
```bash
# Test connection
curl https://your-project.supabase.co/rest/v1/categories \
  -H "apikey: your_anon_key"
```

### AutoCAD Core Not Available

Ensure run_accore.py is in tools/ directory and accessible:
```python
import sys
sys.path.insert(0, './tools')
import run_accore
```

## Performance Optimization

### 1. Database Indexes

Already created:
- `idx_categories_name`
- `idx_blocks_name`
- `idx_blocks_category`
- `idx_recent_files_opened`

### 2. Caching

**Web App:**
```typescript
// Use React Query for caching
import { useQuery } from '@tanstack/react-query';

const { data } = useQuery({
  queryKey: ['blocks'],
  queryFn: () => BlockService.getBlocks(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

**API Bridge:**
```python
from functools import lru_cache

@lru_cache(maxsize=100)
def get_dwg_blocks(filename: str):
    # Cached DWG processing
    pass
```

### 3. Lazy Loading

Implement pagination and infinite scroll in web app:
```typescript
const [page, setPage] = useState(0);
const itemsPerPage = 20;
const paginatedBlocks = blocks.slice(
  page * itemsPerPage,
  (page + 1) * itemsPerPage
);
```

## Next Steps

1. **Implement WebSocket sync** for real-time updates
2. **Add authentication** using Supabase Auth
3. **Generate real thumbnails** via API bridge
4. **Implement file upload** from web to backend
5. **Add collaborative features** (comments, sharing)
6. **Create admin panel** for category management
7. **Integrate with master hivemind** orchestrator

## Support

For issues or questions:
1. Check logs: `docker logs <container>` or console output
2. Verify database connectivity
3. Test API endpoints with curl or Postman
4. Check browser console for client errors
5. Review Python traceback for server errors
