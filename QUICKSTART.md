# Quick Start Guide

Get the Block Library dashboard running in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- Supabase account (already configured)
- Modern web browser

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Start Development Server

```bash
npm run dev
```

The app will open at `http://localhost:5173`

## Step 3: Explore the Dashboard

### Dashboard View
- View statistics (blocks, categories, files)
- Click **Block Library** to browse blocks
- Click **Grid Viewer** to see 3D visualization

### Block Library View
- Browse blocks by category
- Use search to filter
- Toggle between All/Recent/Categories modes
- Click any block card to open in Grid Viewer
- Right sidebar shows live 3D preview

### Grid Viewer
- See animated 3D representation
- Click **Animate** to spin the object
- Toggle **Grid** on/off
- Switch camera between Orbit/FPS modes
- View block information in sidebar

## Features Available Out of the Box

✅ Dashboard with stats and quick actions
✅ Block library browser with filtering
✅ 3D grid viewer with animations
✅ Supabase database integration
✅ 13 pre-configured categories
✅ Responsive design
✅ Dark glass morphism theme

## Database

The database is already set up with:
- Categories table (13 default categories)
- Blocks table (ready for your data)
- Recent files tracking
- Row Level Security enabled

## Add Your Own Blocks

### Via Code

```typescript
import { BlockService } from './lib/blockService';

// Get a category ID
const categories = await BlockService.getCategories();
const relayPanelsCategory = categories.find(c => c.name === 'Relay Panels');

// Add a block
await BlockService.createBlock({
  name: 'Relay Panel Type A',
  category_id: relayPanelsCategory.id,
  dwg_path: '/path/to/file.dwg',
  last_modified: new Date().toISOString(),
  metadata: {
    width: 24,
    height: 36,
    voltage: '480V',
  },
});
```

### Via Database

Connect to Supabase and insert directly:

```sql
INSERT INTO blocks (name, category_id, dwg_path, last_modified)
VALUES (
  'My Block',
  (SELECT id FROM categories WHERE name = 'Relay Panels'),
  '/path/to/block.dwg',
  NOW()
);
```

## Production Build

```bash
npm run build
```

Deploy the `dist/` folder to any static hosting service:
- Vercel
- Netlify
- GitHub Pages
- AWS S3 + CloudFront

## Optional: Python Backend

For full DWG processing and AutoCAD Core integration:

```bash
# Install Python dependencies
pip install fastapi uvicorn python-multipart supabase watchdog

# Start API bridge
python api_bridge.py
```

See `INTEGRATION.md` for complete backend setup.

## Customization

### Change Theme Colors

Edit `src/components/Dashboard.tsx`:

```typescript
const colorMap = {
  blue: '#4a9eff',    // Change to your primary color
  purple: '#6c5ce7',  // Change to your secondary color
  // ... etc
};
```

### Add New Categories

```typescript
await BlockService.createCategory(
  'My Category',
  '#ff6b6b',  // Color
  '🔥',       // Icon
  '/path/to/folder'
);
```

### Modify Card Sizes

In `BlockLibrary.tsx`, adjust:

```typescript
const sizeClasses = {
  compact: 'w-full h-56',  // Make smaller
  medium: 'w-full h-72',   // Default
  large: 'w-full h-80',    // Make larger
};
```

## Keyboard Shortcuts (Grid Viewer)

- `F` - Fit view
- `Space` - Toggle animation
- `M` - Toggle camera mode
- `G` - Toggle grid
- `S` - Screenshot (future feature)

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 5173
npx kill-port 5173

# Or use different port
npm run dev -- --port 3000
```

### Build Errors

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Database Connection Issues

Check `.env` file has correct Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## What's Next?

1. **Add real data**: Import your DWG library
2. **Enable Python bridge**: For AutoCAD Core integration
3. **Add authentication**: Use Supabase Auth
4. **Generate thumbnails**: Via API bridge
5. **Deploy to production**: Vercel/Netlify

## Resources

- `README.md` - Full project documentation
- `INTEGRATION.md` - Python backend integration guide
- `api_bridge.py` - REST API for DWG processing
- `server/*.py` - Python desktop application code

## Questions?

Check the source code - it's well-commented and organized:

```
src/
├── components/
│   ├── Dashboard.tsx      # Main dashboard
│   ├── BlockLibrary.tsx   # Block browser
│   └── GridViewer.tsx     # 3D viewer
├── lib/
│   ├── supabase.ts        # Database client
│   └── blockService.ts    # Data operations
└── App.tsx                # Root component
```

Enjoy building with Block Library! 🎯
