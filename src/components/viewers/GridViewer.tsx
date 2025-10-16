import { useState, useEffect, useRef } from 'react';
import { Home, Maximize, Play, Pause, Grid3x3, Camera, Eye, EyeOff } from 'lucide-react';

interface GridViewerProps {
  onBack: () => void;
  selectedBlock?: any;
}

export function GridViewer({ onBack, selectedBlock }: GridViewerProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [cameraMode, setCameraMode] = useState<'orbit' | 'fps'>('orbit');
  const [rotation, setRotation] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (isAnimating) {
      const animate = () => {
        setRotation((prev) => (prev + 0.5) % 360);
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isAnimating]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#0a0c16';
    ctx.fillRect(0, 0, width, height);

    if (showGrid) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    const centerX = width / 2;
    const centerY = height / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);

    if (selectedBlock) {
      const shapeSize = 120;
      ctx.fillStyle = selectedBlock.color || '#4a9eff';
      ctx.globalAlpha = 0.9;

      const category = (selectedBlock.category || '').toLowerCase();
      if (category.includes('panel') || category.includes('struct') || category.includes('equip')) {
        ctx.fillRect(-shapeSize / 2, -shapeSize / 2, shapeSize, shapeSize);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(-shapeSize / 2, -shapeSize / 2, shapeSize, shapeSize);
      } else if (category.includes('wiring') || category.includes('logic')) {
        ctx.beginPath();
        ctx.arc(0, 0, shapeSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -shapeSize / 2);
        ctx.lineTo(shapeSize / 2, shapeSize / 2);
        ctx.lineTo(-shapeSize / 2, shapeSize / 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#4a9eff';
      ctx.globalAlpha = 0.9;
      ctx.fillRect(-60, -60, 120, 120);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(-60, -60, 120, 120);
    }

    ctx.restore();
  }, [rotation, showGrid, selectedBlock]);

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="max-w-[1800px] mx-auto space-y-6">
        <header className="bg-slate-800/40 backdrop-blur-sm border border-blue-500/30 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-blue-50 mb-2 flex items-center gap-3">
                <Grid3x3 className="w-8 h-8 text-blue-400" />
                Grid Viewer
              </h1>
              <div className="flex items-center gap-2 text-sm text-blue-200/80">
                <button onClick={onBack} className="hover:text-blue-400 transition-colors flex items-center gap-1">
                  <Home className="w-4 h-4" />
                  Dashboard
                </button>
                <span>›</span>
                <span className="font-bold">Grid Viewer</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRotation(0)}
                className="px-4 py-2 bg-slate-900/50 border border-blue-500/40 rounded-xl text-blue-200 hover:bg-slate-900/70 transition-colors flex items-center gap-2"
              >
                <Maximize className="w-4 h-4" />
                Fit
              </button>
              <button
                onClick={() => setCameraMode(cameraMode === 'orbit' ? 'fps' : 'orbit')}
                className="px-4 py-2 bg-slate-900/50 border border-blue-500/40 rounded-xl text-blue-200 hover:bg-slate-900/70 transition-colors flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                {cameraMode === 'orbit' ? 'Orbit' : 'FPS'}
              </button>
              <button
                onClick={() => setIsAnimating(!isAnimating)}
                className="px-4 py-2 bg-slate-900/50 border border-blue-500/40 rounded-xl text-blue-200 hover:bg-slate-900/70 transition-colors flex items-center gap-2"
              >
                {isAnimating ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isAnimating ? 'Stop' : 'Animate'}
              </button>
              <button
                onClick={() => setShowGrid(!showGrid)}
                className="px-4 py-2 bg-slate-900/50 border border-blue-500/40 rounded-xl text-blue-200 hover:bg-slate-900/70 transition-colors flex items-center gap-2"
              >
                {showGrid ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                Grid
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-slate-800/40 backdrop-blur-sm border border-blue-500/30 rounded-2xl p-6 shadow-lg">
              <div className="relative bg-slate-950 rounded-xl overflow-hidden" style={{ height: '600px' }}>
                <canvas
                  ref={canvasRef}
                  width={1200}
                  height={600}
                  className="w-full h-full"
                />

                <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-sm border border-blue-500/40 rounded-xl px-4 py-2">
                  <div className="text-blue-50 font-bold text-sm mb-1">
                    {selectedBlock ? selectedBlock.title : 'Ready'}
                  </div>
                  {selectedBlock && (
                    <div className="text-blue-200/70 text-xs">{selectedBlock.category}</div>
                  )}
                </div>

                <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur-sm border border-blue-500/40 rounded-xl px-4 py-2 text-xs text-blue-200/70">
                  Camera: {cameraMode.toUpperCase()} | Rotation: {Math.floor(rotation)}°
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="bg-slate-800/40 backdrop-blur-sm border border-blue-500/30 rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-bold text-blue-50 mb-4">Block Information</h3>
              {selectedBlock ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-blue-200/60 mb-1">Title</div>
                    <div className="text-sm text-blue-50 font-semibold">{selectedBlock.title}</div>
                  </div>
                  <div>
                    <div className="text-xs text-blue-200/60 mb-1">Category</div>
                    <div className="text-sm text-blue-50">{selectedBlock.category}</div>
                  </div>
                  <div>
                    <div className="text-xs text-blue-200/60 mb-1">Color</div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded border border-blue-500/40"
                        style={{ backgroundColor: selectedBlock.color }}
                      />
                      <span className="text-sm text-blue-50">{selectedBlock.color}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-blue-200/60 mb-1">Status</div>
                    <div className="text-sm text-blue-50">
                      {selectedBlock.pathSet ? '✅ Synced' : '⚠️ Not Synced'}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-blue-200/60">No block selected</p>
              )}
            </div>

            <div className="bg-slate-800/40 backdrop-blur-sm border border-blue-500/30 rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-bold text-blue-50 mb-4">Controls</h3>
              <div className="space-y-2 text-sm text-blue-200/80">
                <div className="flex justify-between">
                  <span>F</span>
                  <span>Fit view</span>
                </div>
                <div className="flex justify-between">
                  <span>Space</span>
                  <span>Toggle animation</span>
                </div>
                <div className="flex justify-between">
                  <span>M</span>
                  <span>Toggle camera mode</span>
                </div>
                <div className="flex justify-between">
                  <span>G</span>
                  <span>Toggle grid</span>
                </div>
                <div className="flex justify-between">
                  <span>S</span>
                  <span>Screenshot</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
