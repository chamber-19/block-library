import React, { useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Line, Html, PerspectiveCamera, useHelper } from '@react-three/drei';
import * as THREE from 'three';
import { getScreenSize, getCameraFOV, getCameraDistance } from '../lib/responsive';
import {
  Maximize2,
  Camera,
  Box,
  Ruler,
  Scissors,
  Eye,
  EyeOff,
  Download,
  Upload,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Layers,
  Move
} from 'lucide-react';

interface ViewerProps {
  blockName: string;
  blockData?: any;
  onClose?: () => void;
}

interface DWGEntity {
  type: 'line' | 'arc' | 'circle' | 'polyline' | 'spline';
  points: [number, number, number][];
  layer?: string;
  color?: string;
}

interface MeasurementPoint {
  position: THREE.Vector3;
  label: string;
}

interface ViewPreset {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
}

const VIEW_PRESETS: ViewPreset[] = [
  { name: 'Isometric', position: [10, 10, 10], target: [0, 0, 0] },
  { name: 'Top', position: [0, 20, 0], target: [0, 0, 0] },
  { name: 'Bottom', position: [0, -20, 0], target: [0, 0, 0] },
  { name: 'Front', position: [0, 0, 20], target: [0, 0, 0] },
  { name: 'Back', position: [0, 0, -20], target: [0, 0, 0] },
  { name: 'Left', position: [-20, 0, 0], target: [0, 0, 0] },
  { name: 'Right', position: [20, 0, 0], target: [0, 0, 0] }
];

function DWGGeometry({ entities }: { entities: DWGEntity[] }) {
  return (
    <group>
      {entities.map((entity, idx) => {
        switch (entity.type) {
          case 'line':
            return (
              <Line
                key={idx}
                points={entity.points}
                color={entity.color || '#4a9eff'}
                lineWidth={2}
              />
            );
          case 'circle':
            return (
              <mesh key={idx} position={entity.points[0]}>
                <circleGeometry args={[1, 32]} />
                <meshBasicMaterial color={entity.color || '#4a9eff'} side={THREE.DoubleSide} />
              </mesh>
            );
          case 'polyline':
            return (
              <Line
                key={idx}
                points={entity.points}
                color={entity.color || '#4a9eff'}
                lineWidth={2}
              />
            );
          default:
            return null;
        }
      })}
    </group>
  );
}

function CrossSectionPlane({
  enabled,
  position,
  rotation
}: {
  enabled: boolean;
  position: [number, number, number];
  rotation: [number, number, number]
}) {
  if (!enabled) return null;

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[20, 20]} />
      <meshBasicMaterial
        color="#ff6b6b"
        transparent
        opacity={0.3}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function MeasurementTool({
  points,
  mode
}: {
  points: THREE.Vector3[];
  mode: 'distance' | 'angle' | 'area' | null
}) {
  if (!mode || points.length === 0) return null;

  if (mode === 'distance' && points.length >= 2) {
    const distance = points[0].distanceTo(points[1]);
    const midpoint = new THREE.Vector3()
      .addVectors(points[0], points[1])
      .multiplyScalar(0.5);

    return (
      <group>
        <Line points={[points[0].toArray(), points[1].toArray()]} color="#00cec9" lineWidth={3} />
        {points.map((point, idx) => (
          <mesh key={idx} position={point.toArray()}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshBasicMaterial color="#00cec9" />
          </mesh>
        ))}
        <Html position={midpoint.toArray()}>
          <div className="bg-slate-900 text-cyan-400 px-3 py-1 rounded-lg border border-cyan-400/30 text-sm font-mono whitespace-nowrap shadow-lg shadow-cyan-500/20">
            {distance.toFixed(2)} units
          </div>
        </Html>
      </group>
    );
  }

  if (mode === 'angle' && points.length >= 3) {
    const v1 = new THREE.Vector3().subVectors(points[0], points[1]);
    const v2 = new THREE.Vector3().subVectors(points[2], points[1]);
    const angle = v1.angleTo(v2) * (180 / Math.PI);

    return (
      <group>
        <Line points={[points[0].toArray(), points[1].toArray()]} color="#fdcb6e" lineWidth={3} />
        <Line points={[points[1].toArray(), points[2].toArray()]} color="#fdcb6e" lineWidth={3} />
        {points.map((point, idx) => (
          <mesh key={idx} position={point.toArray()}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshBasicMaterial color="#fdcb6e" />
          </mesh>
        ))}
        <Html position={points[1].toArray()}>
          <div className="bg-slate-900 text-amber-400 px-3 py-1 rounded-lg border border-amber-400/30 text-sm font-mono whitespace-nowrap shadow-lg shadow-amber-500/20">
            {angle.toFixed(2)}°
          </div>
        </Html>
      </group>
    );
  }

  return null;
}

function Scene({
  entities,
  showGrid,
  crossSection,
  measurementPoints,
  measurementMode
}: {
  entities: DWGEntity[];
  showGrid: boolean;
  crossSection: { enabled: boolean; position: [number, number, number]; rotation: [number, number, number] };
  measurementPoints: THREE.Vector3[];
  measurementMode: 'distance' | 'angle' | 'area' | null
}) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.5} />

      {showGrid && <Grid args={[50, 50]} cellColor="#475569" sectionColor="#64748b" />}

      <DWGGeometry entities={entities} />

      <CrossSectionPlane
        enabled={crossSection.enabled}
        position={crossSection.position}
        rotation={crossSection.rotation}
      />

      <MeasurementTool points={measurementPoints} mode={measurementMode} />
    </>
  );
}

export default function AdvancedViewer({ blockName, blockData, onClose }: ViewerProps) {
  const [entities, setEntities] = useState<DWGEntity[]>([]);
  const [showGrid, setShowGrid] = useState(true);
  const [screenSize, setScreenSize] = useState(getScreenSize());
  const [measurementMode, setMeasurementMode] = useState<'distance' | 'angle' | 'area' | null>(null);
  const [measurementPoints, setMeasurementPoints] = useState<THREE.Vector3[]>([]);
  const [crossSection, setCrossSection] = useState({
    enabled: false,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number]
  });
  const [selectedView, setSelectedView] = useState('Isometric');
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const handleResize = () => setScreenSize(getScreenSize());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (blockData?.entities) {
      const parsedEntities: DWGEntity[] = blockData.entities.map((e: any) => ({
        type: e.type || 'line',
        points: e.points || [],
        layer: e.layer,
        color: e.color || '#4a9eff'
      }));
      setEntities(parsedEntities);
    } else {
      const sampleEntities: DWGEntity[] = [
        {
          type: 'line',
          points: [[-5, 0, 0], [5, 0, 0]],
          color: '#4a9eff'
        },
        {
          type: 'line',
          points: [[0, -5, 0], [0, 5, 0]],
          color: '#00cec9'
        },
        {
          type: 'circle',
          points: [[0, 0, 0]],
          color: '#fd79a8'
        }
      ];
      setEntities(sampleEntities);
    }
  }, [blockData]);

  const applyViewPreset = (preset: ViewPreset) => {
    if (controlsRef.current) {
      controlsRef.current.object.position.set(...preset.position);
      controlsRef.current.target.set(...preset.target);
      controlsRef.current.update();
    }
    setSelectedView(preset.name);
  };

  const handleCanvasClick = (event: any) => {
    if (!measurementMode) return;

    const point = new THREE.Vector3(
      event.point.x,
      event.point.y,
      event.point.z
    );

    if (measurementMode === 'distance') {
      setMeasurementPoints(prev => {
        if (prev.length >= 2) return [point];
        return [...prev, point];
      });
    } else if (measurementMode === 'angle') {
      setMeasurementPoints(prev => {
        if (prev.length >= 3) return [point];
        return [...prev, point];
      });
    }
  };

  const clearMeasurements = () => {
    setMeasurementPoints([]);
    setMeasurementMode(null);
  };

  const resetView = () => {
    applyViewPreset(VIEW_PRESETS[0]);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-50 flex flex-col">
      <div className="bg-gradient-to-r from-slate-900/90 to-blue-900/90 border-b border-blue-500/30 px-3 md:px-6 py-3 md:py-4 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              {blockName}
            </h2>
            <p className="text-xs md:text-sm text-slate-400">Advanced 3D Viewer with Measurements</p>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={onClose}
              className="px-3 md:px-4 py-1.5 md:py-2 text-sm md:text-base bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg border border-red-500/30 transition-all shadow-lg shadow-red-500/10"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 relative">
        <Canvas
          shadows
          camera={{
            position: [getCameraDistance(), getCameraDistance(), getCameraDistance()],
            fov: getCameraFOV()
          }}
          onClick={handleCanvasClick}
        >
          <Suspense fallback={null}>
            <Scene
              entities={entities}
              showGrid={showGrid}
              crossSection={crossSection}
              measurementPoints={measurementPoints}
              measurementMode={measurementMode}
            />
            <OrbitControls ref={controlsRef} makeDefault />
          </Suspense>
        </Canvas>

        <div className="absolute top-3 left-3 md:top-6 md:left-6 space-y-2 md:space-y-3 max-w-[180px] md:max-w-none">
          <div className="bg-slate-900/90 backdrop-blur-xl rounded-xl p-2 md:p-4 border border-blue-500/30 shadow-2xl shadow-blue-500/20">
            <h3 className="text-xs md:text-sm font-semibold text-blue-400 mb-2 md:mb-3 flex items-center gap-1 md:gap-2">
              <Camera className="w-3 h-3 md:w-4 md:h-4" />
              View Presets
            </h3>
            <div className="grid grid-cols-2 gap-1 md:gap-2">
              {VIEW_PRESETS.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => applyViewPreset(preset)}
                  className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs rounded-lg transition-all ${
                    selectedView === preset.name
                      ? 'bg-blue-500/30 text-blue-300 border border-blue-400/50'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/50'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/90 backdrop-blur-xl rounded-xl p-4 border border-cyan-500/30 shadow-2xl shadow-cyan-500/20">
            <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
              <Ruler className="w-4 h-4" />
              Measurements
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setMeasurementMode(measurementMode === 'distance' ? null : 'distance');
                  setMeasurementPoints([]);
                }}
                className={`w-full px-3 py-2 text-xs rounded-lg transition-all flex items-center gap-2 ${
                  measurementMode === 'distance'
                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/50'
                }`}
              >
                <Move className="w-3 h-3" />
                Distance
              </button>
              <button
                onClick={() => {
                  setMeasurementMode(measurementMode === 'angle' ? null : 'angle');
                  setMeasurementPoints([]);
                }}
                className={`w-full px-3 py-2 text-xs rounded-lg transition-all flex items-center gap-2 ${
                  measurementMode === 'angle'
                    ? 'bg-amber-500/30 text-amber-300 border border-amber-400/50'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/50'
                }`}
              >
                <RotateCcw className="w-3 h-3" />
                Angle
              </button>
              {(measurementMode || measurementPoints.length > 0) && (
                <button
                  onClick={clearMeasurements}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-all"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-900/90 backdrop-blur-xl rounded-xl p-4 border border-purple-500/30 shadow-2xl shadow-purple-500/20">
            <h3 className="text-sm font-semibold text-purple-400 mb-3 flex items-center gap-2">
              <Scissors className="w-4 h-4" />
              Cross Section
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => setCrossSection(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`w-full px-3 py-2 text-xs rounded-lg transition-all flex items-center gap-2 ${
                  crossSection.enabled
                    ? 'bg-purple-500/30 text-purple-300 border border-purple-400/50'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/50'
                }`}
              >
                {crossSection.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {crossSection.enabled ? 'Hide' : 'Show'} Plane
              </button>
              {crossSection.enabled && (
                <>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    step="0.5"
                    value={crossSection.position[1]}
                    onChange={(e) => setCrossSection(prev => ({
                      ...prev,
                      position: [prev.position[0], parseFloat(e.target.value), prev.position[2]]
                    }))}
                    className="w-full"
                  />
                  <div className="text-xs text-slate-400">Height: {crossSection.position[1].toFixed(1)}</div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="absolute top-3 right-3 md:top-6 md:right-6 bg-slate-900/90 backdrop-blur-xl rounded-xl p-2 md:p-4 border border-slate-700/50 shadow-2xl max-w-[180px] md:max-w-none">
          <h3 className="text-xs md:text-sm font-semibold text-slate-300 mb-2 md:mb-3 flex items-center gap-1 md:gap-2">
            <Layers className="w-3 h-3 md:w-4 md:h-4" />
            Display Options
          </h3>
          <div className="space-y-1 md:space-y-2">
            <label className="flex items-center gap-1 md:gap-2 text-[10px] md:text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="rounded"
              />
              Show Grid
            </label>
            <button
              onClick={resetView}
              className="w-full px-2 md:px-3 py-1.5 md:py-2 text-[10px] md:text-xs rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 border border-slate-700/50 transition-all flex items-center gap-1 md:gap-2"
            >
              <RotateCcw className="w-3 h-3" />
              Reset View
            </button>
          </div>
        </div>

        <div className="hidden md:block absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900/90 backdrop-blur-xl rounded-xl px-6 py-3 border border-slate-700/50 shadow-2xl">
          <div className="text-xs text-slate-400 space-y-1">
            <div><strong>Left Click + Drag:</strong> Rotate</div>
            <div><strong>Right Click + Drag:</strong> Pan</div>
            <div><strong>Scroll:</strong> Zoom</div>
            {measurementMode && <div className="text-cyan-400"><strong>Click:</strong> Add measurement point</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
