import { useCallback, useEffect, useRef, useState } from 'react';
import { TitleScreen } from './components/TitleScreen';
import { RaceHud } from './components/RaceHud';
import { CozyAudioEngine } from './game/audio';
import { RacingEngine, TouchInputState } from './game/RacingEngine';
import {
  CameraMode,
  CAR_COLORS,
  GameMode,
  HudSnapshot,
  StageId,
} from './game/types';

const INITIAL_HUD: HudSnapshot = {
  speedKmh: 0,
  lap: 1,
  totalLaps: 3,
  position: 1,
  totalRacers: 4,
  raceTimeMs: 0,
  bestLapMs: null,
  boostCharge: 35,
  isDrifting: false,
  isBoosting: false,
  starsCollected: 0,
  countdownLabel: null,
  playerMapPos: { x: 50, y: 50 },
  rivalMapPositions: [],
  trackMapPath: [],
  finishStandings: [],
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RacingEngine | null>(null);
  const audioRef = useRef<CozyAudioEngine | null>(null);

  const [mode, setMode] = useState<GameMode>('title');
  const [stageId, setStageId] = useState<StageId>('desert');
  const [carColor, setCarColor] = useState<string>(CAR_COLORS[0].id);
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [hudHidden, setHudHidden] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const audio = new CozyAudioEngine();
    audioRef.current = audio;

    const engine = new RacingEngine(container, audio, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onModeChange: (nextMode) => setMode(nextMode),
      onContextLost: (lost) => setContextLost(lost),
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      audio.dispose();
      engineRef.current = null;
      audioRef.current = null;
    };
  }, []);

  const handleSelectStage = useCallback((nextStage: StageId) => {
    setStageId(nextStage);
    engineRef.current?.loadStage(nextStage);
  }, []);

  const handleSelectCarColor = useCallback((colorId: string) => {
    setCarColor(colorId);
    engineRef.current?.setCarColor(colorId);
  }, []);

  const handleStartRace = useCallback(() => {
    setHudHidden(false);
    engineRef.current?.startRace();
  }, []);

  const handleTogglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  const handleRestartRace = useCallback(() => {
    engineRef.current?.startRace();
  }, []);

  const handleReturnToTitle = useCallback(() => {
    engineRef.current?.returnToTitle();
  }, []);

  const handleSelectNextStage = useCallback((nextStage: StageId) => {
    setStageId(nextStage);
    engineRef.current?.loadStage(nextStage);
    engineRef.current?.startRace();
  }, []);

  const handleCycleCamera = useCallback(() => {
    if (!engineRef.current) return;
    setCameraMode(engineRef.current.cycleCameraMode());
  }, []);

  const handleToggleMute = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.unlock();
    setIsMuted(audioRef.current.toggleMute());
  }, []);

  const handleTouchInput = useCallback((partial: Partial<TouchInputState>) => {
    engineRef.current?.setTouchInput(partial);
  }, []);

  // Global Keyboard Shortcuts for Game Shell (Enter/Space on Title, Esc Pause, C Camera, M Mute, H HUD)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        handleStartRace();
      } else if (e.code === 'Escape' && (mode === 'racing' || mode === 'paused')) {
        e.preventDefault();
        handleTogglePause();
      } else if (e.code === 'KeyC' && mode !== 'title') {
        handleCycleCamera();
      } else if (e.code === 'KeyM') {
        handleToggleMute();
      } else if (e.code === 'KeyH' && mode !== 'title') {
        setHudHidden((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, handleStartRace, handleTogglePause, handleCycleCamera, handleToggleMute]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0e1017]">
      {/* Isolated WebGL Canvas Mount */}
      <div
        ref={canvasMountRef}
        className="fixed inset-0 z-0 w-full h-full"
        aria-label="3D racing viewport"
      />

      {/* WebGL Context Loss Graceful Fallback */}
      {contextLost && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0e1017] p-6 text-center">
          <div className="max-w-sm rounded-2xl bg-[#151926] border border-white/15 p-6">
            <h2 className="font-display font-bold text-xl text-white">
              Graphics Context Restoring
            </h2>
            <p className="mt-2 text-sm text-stone-300">
              Your browser paused the 3D viewport. Please wait a moment or reload if it does not resume automatically.
            </p>
          </div>
        </div>
      )}

      {/* Title Screen vs Active Racing HUD */}
      {mode === 'title' ? (
        <TitleScreen
          selectedStage={stageId}
          selectedCarColor={carColor}
          isMuted={isMuted}
          onSelectStage={handleSelectStage}
          onSelectCarColor={handleSelectCarColor}
          onStartRace={handleStartRace}
          onToggleMute={handleToggleMute}
        />
      ) : (
        <RaceHud
          mode={mode}
          stageId={stageId}
          cameraMode={cameraMode}
          isMuted={isMuted}
          hudHidden={hudHidden}
          hud={hud}
          onTogglePause={handleTogglePause}
          onToggleMute={handleToggleMute}
          onCycleCamera={handleCycleCamera}
          onToggleHudHidden={() => setHudHidden((prev) => !prev)}
          onRestartRace={handleRestartRace}
          onReturnToTitle={handleReturnToTitle}
          onSelectNextStage={handleSelectNextStage}
          onTouchInput={handleTouchInput}
        />
      )}
    </main>
  );
}
