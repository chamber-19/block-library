# Block Library Hivemind Dashboard

A modern web-based dashboard for managing AutoCAD block libraries, designed to integrate with Python desktop applications and serve as a component in a larger hivemind project.

## Overview

This application provides a web interface that mirrors and extends the functionality of the Python PySide6 desktop application. It features:

- **Dashboard View**: Real-time statistics, quick actions, and recent activity
- **Block Library**: Browsable catalog of blocks organized by categories with filtering and pagination
- **Grid Viewer**: 3D visualization of blocks with animation controls
- **Supabase Integration**: Full database persistence for categories, blocks, and user activity

## Architecture

### Frontend (React + TypeScript)
- **App.tsx**: Main application with view routing
- **Dashboard.tsx**: Overview with stats, quick actions, and recent files
- **BlockLibrary.tsx**: Full library browser with filtering and preview
- **GridViewer.tsx**: 3D viewer with canvas-based rendering

### Backend (Supabase)
- **categories**: Block category definitions with colors and icons
- **blocks**: Individual block metadata with DWG paths and thumbnails
- **recent_files**: User file access history

### Python Integration Points

The web app is designed to work alongside your Python applications:

1. **server/app.py**: Main PySide6 application with block library UI
2. **server/dashboard_layout.py**: Dashboard with embedded library view
3. **server/block_library_layout.py**: Category cards with 3D preview
4. **server/grid_viewer.py**: Qt3D viewer with HUD and controls
5. **server/accore_worker.py**: AutoCAD Core worker for DWG processing

## Features

### Dashboard
- Live statistics (total blocks, categories, DWG files, recent files)
- Quick action cards for navigation
- Recent file history with timestamps
- Activity feed
- User profile section

### Block Library
- Category-based organization with color coding
- Search and filtering capabilities
- View modes: All, Recent (30 days), Categories
- Pagination with page controls
- Card size options: Compact, Medium, Large
- Live 3D preview panel
- Click to open in Grid Viewer

### Grid Viewer
- Canvas-based 3D rendering
- Shape types based on category:
  - Panels/Structural/Equipment → Cube
  - Wiring/Logic → Sphere
  - Others → Triangle
- Animation controls (play/pause turntable)
- Camera modes: Orbit, FPS
- Grid toggle
- Block information panel
- Keyboard shortcuts

## Database Schema

### Categories Table
```sql
- id: uuid (primary key)
- name: text (unique)
- color: text (hex color)
- icon: text (emoji)
- path: text (optional file system path)
- created_at, updated_at: timestamptz
```

### Blocks Table
```sql
- id: uuid (primary key)
- name: text
- category_id: uuid (foreign key)
- dwg_path: text (optional)
- thumbnail_url: text (optional)
- last_modified: timestamptz (optional)
- metadata: jsonb
- created_at, updated_at: timestamptz
```

### Recent Files Table
```sql
- id: uuid (primary key)
- user_id: uuid (optional)
- file_path: text
- file_name: text
- file_type: text
- opened_at: timestamptz
```

## Integration with Python Backend

### Shared Data Model
The web app uses the same category structure as the Python application:
- Relay Panels
- Schematic
- Wiring
- Grounding
- Conduit
- One-Line
- Vendor
- Logic
- Structural
- Equipment
- Drafting Standards
- Stamps
- Logos

### Future Integration Options

1. **REST API Bridge**: Create a FastAPI server to bridge Python desktop app and web app
2. **File System Sync**: Use watchdog (already in Python app) to monitor DWG changes
3. **WebSocket Updates**: Real-time sync of file changes between desktop and web
4. **Thumbnail Generation**: Python app generates thumbnails, uploads to Supabase Storage
5. **AutoCAD Core Integration**: Web app triggers Python workers for DWG processing

### Recommended Architecture for Hivemind Integration

```
┌─────────────────────────────────────────────────────────┐
│                    Hivemind Master App                  │
│                  (Orchestration Layer)                  │
└─────────────────┬───────────────────────┬───────────────┘
                  │                       │
        ┌─────────▼──────────┐   ┌────────▼─────────┐
        │  Web Dashboard     │   │  Python Desktop  │
        │  (This Project)    │   │  (PySide6 App)   │
        │                    │   │                  │
        │  - React UI        │   │  - Qt3D Viewer   │
        │  - Supabase DB     │   │  - AutoCAD Core  │
        │  - Real-time stats │   │  - File Watcher  │
        └────────┬───────────┘   └────────┬─────────┘
                 │                        │
                 └────────────┬───────────┘
                              │
                    ┌─────────▼──────────┐
                    │   Supabase DB      │
                    │   - Categories     │
                    │   - Blocks         │
                    │   - Recent Files   │
                    │   - File Storage   │
                    └────────────────────┘
```

## Development

### Prerequisites
- Node.js 18+
- npm or pnpm
- Supabase account (already configured)

### Setup
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck
```

### Environment Variables
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Design System

### Color Palette
- Primary: #4a9eff (Blue)
- Secondary: #6c5ce7 (Purple)
- Accent: #00cec9 (Teal)
- Success: #00b894 (Green)
- Warning: #fdcb6e (Amber)
- Error: #fd79a8 (Pink)

### Glass Morphism Theme
- Background: Gradient from slate-950 to blue-950
- Cards: Semi-transparent slate-800 with backdrop blur
- Borders: Blue-500 with 30% opacity
- Shadows: Soft glows matching element colors

## API Integration (Future)

### Suggested Endpoints

```typescript
// Categories
GET    /api/categories
POST   /api/categories
PUT    /api/categories/:id
DELETE /api/categories/:id

// Blocks
GET    /api/blocks
GET    /api/blocks/:id
POST   /api/blocks
PUT    /api/blocks/:id
DELETE /api/blocks/:id

// DWG Processing (Python bridge)
POST   /api/dwg/process
POST   /api/dwg/thumbnail
GET    /api/dwg/blocks/:filename
GET    /api/dwg/curves/:filename/:blockname

// File System
GET    /api/files/scan
POST   /api/files/sync
GET    /api/files/recent
```

## Python Desktop App Notes

Your Python applications include:
- **LibraryConfig**: YAML-based folder management
- **IndexerCore**: SQLite indexing for fast searches
- **ThumbnailWorker**: Background thumbnail generation
- **AutoCADWorker**: Threaded AutoCAD Core operations
- **BlockPreviewWidget**: 2D curve rendering

These can be exposed via a Python web server (FastAPI/Flask) to provide:
1. Real DWG file processing
2. Thumbnail generation
3. File system monitoring
4. AutoCAD Core integration

## Deployment

### Web App (Vercel/Netlify)
```bash
npm run build
# Deploy dist/ folder
```

### Python Backend (Docker)
```dockerfile
FROM python:3.11
RUN pip install PySide6 pyyaml watchdog
COPY server/ /app/
CMD ["python", "/app/app.py"]
```

## Roadmap

- [ ] Add authentication (Supabase Auth)
- [ ] Real thumbnail generation via Python worker
- [ ] WebSocket sync between desktop and web
- [ ] DWG file upload and processing
- [ ] Advanced 3D viewer with Three.js/WebGL
- [ ] Collaborative features (comments, sharing)
- [ ] Export to various formats (PDF, DXF, etc)
- [ ] Search across DWG content
- [ ] Version control for blocks
- [ ] Integration with master hivemind orchestrator

## Contributing

This is a component designed for integration into a larger hivemind architecture. Future development should focus on:
1. Clean API boundaries
2. Event-driven communication
3. Stateless design where possible
4. Comprehensive error handling
5. Performance optimization for large libraries

## License

[Your License Here]
