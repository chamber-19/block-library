# Development Setup Guide

## Quick Start (Recommended for Your Use Case)

### One-Time Setup on Each Machine

1. **Install Node.js** (v20+)
   - Download from https://nodejs.org

2. **Install Python** (3.11+)
   - Download from https://python.org

3. **Clone/Copy Project**
   ```bash
   git clone <your-repo>
   cd project
   ```

4. **Install Dependencies**
   ```bash
   # Frontend
   npm install

   # Backend
   pip install -r requirements.txt
   ```

5. **Make sure `.env` file exists** (already included with Supabase credentials)

### Daily Development

**Open 2 terminals:**

**Terminal 1 - Frontend:**
```bash
npm run dev
```
- Opens browser at http://localhost:5173
- Auto-reloads on file changes

**Terminal 2 - Backend (optional):**
```bash
python server/app.py
```
- Runs on http://localhost:8000
- Only needed if using CAD/3D processing features

**That's it!** Code, save, refresh browser.

---

## Syncing Between Laptop & Desktop

### Option A: Git (Recommended)

**Setup once:**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo>
git push -u origin main
```

**Daily workflow:**
```bash
# Before you start working:
git pull

# When done for the day:
git add .
git commit -m "Your changes"
git push
```

### Option B: Cloud Sync
- Move project folder to Dropbox/OneDrive/Google Drive
- Both machines auto-sync
- **Note:** Add `node_modules/` to selective sync exclusion

---

## Docker Setup (Optional - More Portable)

If you prefer containers:

### One-Time Setup
```bash
# Install Docker Desktop
# Download from https://docker.com
```

### Run Everything
```bash
docker-compose up
```

**Access:**
- Frontend: http://localhost:5173
- Backend: http://localhost:8000

**Stop:**
```bash
docker-compose down
```

**Rebuild after dependency changes:**
```bash
docker-compose up --build
```

---

## What to Sync vs Ignore

### ✅ Commit to Git:
- All `/src` files
- All `/server` files
- `package.json`, `requirements.txt`
- `.env` (your Supabase credentials)
- Config files (vite, tailwind, tsconfig)

### ❌ DON'T Commit:
- `node_modules/` (reinstall with `npm install`)
- `dist/` (build output)
- `__pycache__/` (Python cache)
- `.env.local` (local overrides)

---

## Troubleshooting

### Frontend won't start:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Backend errors:
```bash
pip install -r requirements.txt --upgrade
```

### Port already in use:
```bash
# Kill process on port 5173:
lsof -ti:5173 | xargs kill -9

# Or change port in vite.config.ts
```

---

## Project Structure

```
project/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── contexts/           # React contexts
│   └── lib/               # Utilities & Supabase client
├── server/                # Python backend
│   ├── app.py            # Main FastAPI server
│   └── *.py              # CAD processing modules
├── .env                   # Supabase credentials
├── package.json          # Node dependencies
└── requirements.txt      # Python dependencies
```

---

## Next Steps

1. **Start development:** `npm run dev` in one terminal
2. **Make changes** to files in `/src`
3. **See changes** instantly in browser
4. **Commit regularly** with `git add . && git commit -m "message"`
5. **Push to sync** with `git push`

That's all you need! Keep it simple.
