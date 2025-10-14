import { useState, useEffect, useRef } from 'react';
import { Package, Database, Layers, Zap, FileText, Grid3x3, FolderOpen, Image } from 'lucide-react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { LoadingCard } from './LoadingCard';
import { ProgressBar } from './ProgressBar';
import { getScreenSize, getCameraFOV, getCameraDistance } from '../lib/responsive';

interface SplashScreenProps {
  onComplete: () => void;
}

interface LoadingStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  duration: number;
  targetCount: number;
}

interface BlockConfig {
  id: number;
  shapeType: 'cube' | 'plank' | 'chip' | 'resistor';
  color: string;
  scale: number;
  dimensions?: { width?: number; height?: number; depth?: number };
  bandColors?: string[];
  initialPosition: [number, number, number];
  initialVelocity: [number, number, number];
  initialAngularVelocity: [number, number, number];
}

function CameraRig() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 5, 20);
    camera.lookAt(0, -4, 0);
  }, [camera]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    // Very subtle side-to-side panning
    camera.position.x = Math.sin(time * 0.1) * 0.5;
    // Slight vertical movement for more dynamic feel
    camera.position.y = 5 + Math.sin(time * 0.15) * 0.2;
  });

  return null;
}

function Floor() {
  return (
    <RigidBody type="fixed" position={[0, -8.5, 7.5]} rotation={[-Math.PI / 2, 0, 0]}>
      <CuboidCollider args={[50, 75, 0.1]} />
      <mesh receiveShadow>
        <planeGeometry args={[100, 150]} />
        <meshPhysicalMaterial
          color="#1f2937"
          metalness={0.5}
          roughness={0.5}
          envMapIntensity={0.5}
        />
      </mesh>
    </RigidBody>
  );
}

function PhysicsBlock({ config }: { config: BlockConfig }) {
  const getArgs = (): [number, number, number] => {
    if (config.shapeType === 'cube') {
      return [config.scale, config.scale, config.scale];
    }
    if (config.shapeType === 'plank') {
      const w = (config.dimensions?.width || 2.5) * config.scale;
      const h = (config.dimensions?.height || 0.8) * config.scale;
      const d = (config.dimensions?.depth || 0.8) * config.scale;
      return [w, h, d];
    }
    if (config.shapeType === 'chip') {
      const w = (config.dimensions?.width || 1) * config.scale;
      const h = (config.dimensions?.height || 0.3) * config.scale;
      const d = (config.dimensions?.depth || 1) * config.scale;
      return [w, h, d];
    }
    return [config.scale, config.scale, config.scale];
  };

  const args = getArgs();

  if (config.shapeType === 'resistor') {
    const radius = (config.dimensions?.width || 0.4) * config.scale * 0.5;
    const height = (config.dimensions?.height || 1.2) * config.scale;

    return (
      <RigidBody
        position={config.initialPosition}
        linearVelocity={config.initialVelocity}
        angularVelocity={config.initialAngularVelocity}
        rotation={[0, 0, Math.PI / 2]}
        friction={0.8}
        restitution={0.3}
        linearDamping={0.4}
        angularDamping={0.4}
        canSleep={true}
        ccd={true}
      >
        <CylinderCollider args={[height / 2, radius]} rotation={[0, 0, Math.PI / 2]} />
        <group>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[radius, radius, height * 0.7, 16]} />
            <meshPhysicalMaterial
              color={config.color}
              metalness={0.3}
              roughness={0.7}
              iridescence={0.3}
              iridescenceIOR={1.5}
            />
          </mesh>
          {config.bandColors && config.bandColors.map((color, i) => {
            const bandX = -height * 0.25 + (i * height * 0.15);
            return (
              <mesh key={i} position={[bandX, 0, 0]} castShadow rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[radius * 1.05, radius * 1.05, height * 0.06, 16]} />
                <meshStandardMaterial color={color} metalness={0.2} roughness={0.8} />
              </mesh>
            );
          })}
          {[-1, 1].map((dir, i) => (
            <mesh key={`lead-${i}`} position={[dir * height * 0.45, 0, 0]} castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[radius * 0.4, radius * 0.4, height * 0.15, 8]} />
              <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.1} />
            </mesh>
          ))}
        </group>
      </RigidBody>
    );
  }

  return (
    <RigidBody
      position={config.initialPosition}
      linearVelocity={config.initialVelocity}
      angularVelocity={config.initialAngularVelocity}
      friction={0.8}
      restitution={0.3}
      linearDamping={0.4}
      angularDamping={0.4}
      canSleep={true}
      ccd={true}
    >
      <CuboidCollider args={[args[0] / 2, args[1] / 2, args[2] / 2]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={args} />
        <meshPhysicalMaterial
          color={config.color}
          metalness={0.5}
          roughness={0.5}
          envMapIntensity={0.6}
          iridescence={0.5}
          iridescenceIOR={2.0}
        />
      </mesh>
    </RigidBody>
  );
}

function AnimatedFog() {
  const fogRef = useRef<THREE.FogExp2>(null);

  useFrame((state) => {
    if (fogRef.current) {
      const time = state.clock.getElapsedTime();
      // Gentle fog density animation
      fogRef.current.density = 0.005 + Math.sin(time * 0.2) * 0.001;
    }
  });

  return <fogExp2 ref={fogRef} attach="fog" args={['#0f1419', 0.005]} />;
}

function FallingBlocks() {
  const [blocks, setBlocks] = useState<BlockConfig[]>([]);
  const nextId = useRef(0);
  const lastSpawn = useRef(0);
  const screenSize = getScreenSize();

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const maxBlocks = screenSize.isMobile ? 80 : screenSize.isTablet ? 120 : 180;
    const blockSpawnRate = 0.12;

    if (time - lastSpawn.current > blockSpawnRate && blocks.length < maxBlocks) {
      lastSpawn.current = time;

      const categoryColors = [
        '#4a9eff', '#6c5ce7', '#00cec9', '#fd79a8',
        '#fdcb6e', '#e17055', '#00b894', '#a29bfe',
      ];

      const colors = categoryColors.flatMap(c => [c, c, c]);
      const shapeTypes: Array<'cube' | 'plank' | 'chip' | 'resistor'> = [
        'cube', 'cube', 'cube', 'cube', 'cube', 'cube',
        'plank', 'plank', 'plank',
        'chip', 'chip',
        'resistor', 'resistor'
      ];

      const selectedShape = shapeTypes[Math.floor(Math.random() * shapeTypes.length)];
      let scale = 0.4 + Math.random() * 0.4;
      let dimensions = {};
      let bandColors: string[] | undefined;

      if (selectedShape === 'plank') {
        scale = 0.5 + Math.random() * 0.3;
        dimensions = { width: 2.5, height: 0.8, depth: 0.8 };
      } else if (selectedShape === 'chip') {
        scale = 0.35 + Math.random() * 0.25;
        dimensions = { width: 1, height: 0.3, depth: 1 };
      } else if (selectedShape === 'resistor') {
        scale = 0.4 + Math.random() * 0.3;
        dimensions = { width: 0.4, height: 1.2, depth: 0.4 };
        const availableColors = ['#000000', '#8B4513', '#FFD700', '#C0C0C0', '#FF0000', '#00FF00', '#0000FF', '#FFFF00'];
        bandColors = [
          availableColors[Math.floor(Math.random() * availableColors.length)],
          availableColors[Math.floor(Math.random() * availableColors.length)],
          availableColors[Math.floor(Math.random() * availableColors.length)]
        ];
      }

      const spawnWidth = screenSize.isMobile ? 40 : screenSize.isTablet ? 60 : 80;
      const spawnDepth = screenSize.isMobile ? 60 : screenSize.isTablet ? 80 : 110;
      const spawnHeight = screenSize.isMobile ? 12 : 15;

      const spawnFromSide = Math.random() < 0.8;
      let spawnX: number, spawnZ: number;
      let initialVelX: number, initialVelZ: number;

      if (spawnFromSide) {
        if (Math.random() < 0.6) {
          const isLeft = Math.random() < 0.5;
          spawnX = isLeft ? -spawnWidth * (0.3 + Math.random() * 0.2) : spawnWidth * (0.3 + Math.random() * 0.2);
          spawnZ = (Math.random() - 0.5) * spawnDepth * 0.8;
          initialVelX = isLeft ? Math.random() * 1.5 + 0.5 : -(Math.random() * 1.5 + 0.5);
          initialVelZ = (Math.random() - 0.5) * 0.5;
        } else {
          const isFront = Math.random() < 0.5;
          spawnX = (Math.random() - 0.5) * spawnWidth * 0.8;
          spawnZ = isFront ? -spawnDepth * (0.3 + Math.random() * 0.2) : spawnDepth * (0.3 + Math.random() * 0.2);
          initialVelX = (Math.random() - 0.5) * 0.5;
          initialVelZ = isFront ? Math.random() * 1.5 + 0.5 : -(Math.random() * 1.5 + 0.5);
        }
      } else {
        spawnX = (Math.random() - 0.5) * spawnWidth * 0.3;
        spawnZ = (Math.random() - 0.5) * spawnDepth * 0.3;
        initialVelX = (Math.random() - 0.5) * 0.5;
        initialVelZ = (Math.random() - 0.5) * 0.5;
      }

      const newBlock: BlockConfig = {
        id: nextId.current++,
        shapeType: selectedShape,
        color: colors[Math.floor(Math.random() * colors.length)],
        scale,
        dimensions,
        bandColors,
        initialPosition: [
          spawnX,
          spawnHeight + Math.random() * 3,
          spawnZ
        ],
        initialVelocity: [
          initialVelX,
          -0.5 - Math.random() * 0.5,
          initialVelZ
        ],
        initialAngularVelocity: [
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ],
      };

      setBlocks((prev) => [...prev, newBlock]);
    }
  });

  return (
    <>
      {blocks.map((block) => (
        <PhysicsBlock key={block.id} config={block} />
      ))}
    </>
  );
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [itemCount, setItemCount] = useState(0);
  const [targetCount, setTargetCount] = useState(0);
  const screenSize = getScreenSize();

  const loadingSteps: LoadingStep[] = [
    {
      id: 'database',
      label: 'Establishing secure connection',
      icon: <Database className="w-4 h-4" />,
      duration: 3000,
      targetCount: 0,
    },
    {
      id: 'schema',
      label: 'Verifying database schema',
      icon: <Grid3x3 className="w-4 h-4" />,
      duration: 3000,
      targetCount: 0,
    },
    {
      id: 'categories',
      label: 'Loading category structure',
      icon: <FolderOpen className="w-4 h-4" />,
      duration: 3000,
      targetCount: 0,
    },
    {
      id: 'blocks',
      label: 'Indexing block library',
      icon: <Package className="w-4 h-4" />,
      duration: 3000,
      targetCount: Math.floor(Math.random() * 1000) + 2500,
    },
    {
      id: 'thumbnails',
      label: 'Generating thumbnails',
      icon: <Image className="w-4 h-4" />,
      duration: 3000,
      targetCount: 0,
    },
    {
      id: 'metadata',
      label: 'Processing metadata',
      icon: <FileText className="w-4 h-4" />,
      duration: 3000,
      targetCount: 0,
    },
    {
      id: 'layers',
      label: 'Initializing render layers',
      icon: <Layers className="w-4 h-4" />,
      duration: 3000,
      targetCount: 0,
    },
    {
      id: 'ready',
      label: 'Finalizing interface',
      icon: <Zap className="w-4 h-4" />,
      duration: 3000,
      targetCount: 0,
    },
  ];

  const totalDuration = loadingSteps.reduce((sum, step) => sum + step.duration, 0);

  useEffect(() => {
    if (currentStep >= loadingSteps.length) {
      setProgress(100);
      setIsExiting(true);
      const exitTimer = setTimeout(onComplete, 2000);
      return () => clearTimeout(exitTimer);
    }

    const stepDuration = loadingSteps[currentStep].duration;
    const timer = setTimeout(() => {
      setCurrentStep((s) => s + 1);
    }, stepDuration);

    return () => clearTimeout(timer);
  }, [currentStep, onComplete]);

  useEffect(() => {
    if (currentStep >= loadingSteps.length) {
      setProgress(100);
      return;
    }

    const elapsedTime = loadingSteps.slice(0, currentStep).reduce((sum, step) => sum + step.duration, 0);
    const currentStepDuration = loadingSteps[currentStep].duration;
    const startProgress = (elapsedTime / totalDuration) * 100;
    const endProgress = ((elapsedTime + currentStepDuration) / totalDuration) * 100;

    const progressInterval = 100;
    const totalIncrements = currentStepDuration / progressInterval;
    const progressIncrement = (endProgress - startProgress) / totalIncrements;

    setProgress(startProgress);

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + progressIncrement;
        if (next >= endProgress) {
          return endProgress;
        }
        return next;
      });
    }, progressInterval);

    return () => clearInterval(interval);
  }, [currentStep, totalDuration]);

  useEffect(() => {
    if (currentStep >= loadingSteps.length) return;

    const currentTarget = loadingSteps[currentStep].targetCount;
    setTargetCount(currentTarget);
    setItemCount(0);

    if (currentTarget > 0) {
      const stepDuration = loadingSteps[currentStep].duration;
      const updateInterval = 50;
      const totalIncrements = stepDuration / updateInterval;
      const incrementAmount = currentTarget / totalIncrements;

      const countInterval = setInterval(() => {
        setItemCount((prev) => {
          const next = prev + incrementAmount;
          if (next >= currentTarget) {
            clearInterval(countInterval);
            return currentTarget;
          }
          return next;
        });
      }, updateInterval);

      return () => clearInterval(countInterval);
    }
  }, [currentStep]);

  return (
    <div
      className={`fixed inset-0 z-[100] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-start justify-center pt-8 transition-all duration-[2000ms] overflow-hidden ${
        isExiting ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>

      <div className="absolute inset-0 pointer-events-none">
        <Canvas
          camera={{
            position: [0, screenSize.isMobile ? 0 : 2, getCameraDistance() + 5],
            fov: getCameraFOV() + 10,
            rotation: [screenSize.isMobile ? -0.05 : -0.1, 0, 0]
          }}
          shadows
          dpr={[1, 2]}
          frameloop="always"
          gl={{
            antialias: true,
            alpha: false,
            stencil: false,
            depth: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.3,
            outputColorSpace: THREE.SRGBColorSpace
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <color attach="background" args={['#0a0f1a']} />
          <AnimatedFog />

          <ambientLight intensity={0.4} color="#b8c5d6" />
          <directionalLight
            position={[10, 20, 15]}
            intensity={1.5}
            color="#ffffff"
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-camera-far={60}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={35}
            shadow-camera-bottom={-20}
            shadow-bias={-0.00015}
            shadow-normalBias={0.02}
          />
          <hemisphereLight args={['#4a90e2', '#0f1419', 0.5]} />

          <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
            <CameraRig />
            <Floor />
            <FallingBlocks />
          </Physics>

        </Canvas>
      </div>

      <div className={`text-center space-y-4 sm:space-y-6 px-4 sm:px-6 md:px-8 relative z-10 max-w-4xl 3xl:max-w-6xl transition-all duration-[2000ms] ${
        isExiting ? 'opacity-0 scale-90' : 'opacity-100 scale-100'
      }`}>
        <div className="space-y-2 fade-in">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl 3xl:text-8xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 drop-shadow-2xl mb-3 animate-[gradient_8s_ease_infinite] bg-[length:200%_auto]">
            Block Library
          </h1>
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl 3xl:text-3xl text-slate-400 font-semibold fade-in delay-100 drop-shadow-lg">
            Professional CAD Management System
          </p>
        </div>

        <div className="w-full max-w-[240px] sm:max-w-[280px] md:max-w-[320px] 3xl:max-w-[400px] mx-auto space-y-2 mt-2 scale-90 sm:scale-95 md:scale-100">
          <div className="space-y-1.5">
            {loadingSteps.map((step, index) => (
              <LoadingCard
                key={step.id}
                label={step.label}
                icon={step.icon}
                isActive={index === currentStep}
                isComplete={index < currentStep}
                index={index}
                blockCount={index === currentStep && targetCount > 0 ? Math.floor(itemCount) : undefined}
              />
            ))}
          </div>

          {currentStep < loadingSteps.length && <ProgressBar progress={progress} />}
        </div>

      </div>

      <div className="fixed bottom-20 sm:bottom-24 right-4 sm:right-6 text-left z-20">
        <div className="text-slate-500 dark:text-blue-300/60 text-[10px] sm:text-[11px] 3xl:text-xs font-medium mb-1">
          Root3Power
        </div>
        <div className="text-slate-400 dark:text-blue-400/40 text-[9px] sm:text-[10px] 3xl:text-[11px]">
          v1.0f375
        </div>
        <div className="text-slate-400 dark:text-blue-400/40 text-[9px] sm:text-[10px] 3xl:text-[11px] mt-0.5">
          Developed by Dustin
        </div>
      </div>
    </div>
  );
}