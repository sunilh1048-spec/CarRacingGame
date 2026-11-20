import React from 'react';
import {
  Camera,
  Eye,
  EyeOff,
  Pause,
  Play,
  RotateCcw,
  Star,
  Volume2,
  VolumeX,
  Zap,
  Home,
} from 'lucide-react';
import { TouchInputState } from '../game/RacingEngine';
import {
  CameraMode,
  GameMode,
  HudSnapshot,
  STAGE_ORDER,
  STAGES,
  StageId,
} from '../game/types';

interface RaceHudProps {
  mode: GameMode;
  stageId: StageId;
  cameraMode: CameraMode;
  isMuted: boolean;
  hudHidden: boolean;
  hud: HudSnapshot;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onCycleCamera: () => void;
  onToggleHudHidden: () => void;
  onRestartRace: () => void;
  onReturnToTitle: () => void;
  onSelectNextStage: (nextStage: StageId) => void;
  onTouchInput: (partial: Partial<TouchInputState>) => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function ordinal(pos: number): string {
  if (pos === 1) return '1st';
  if (pos === 2) return '2nd';
  if (pos === 3) return '3rd';
  return `${pos}th`;
}

export const RaceHud: React.FC<RaceHudProps> = ({
  mode,
  stageId,
  cameraMode,
  isMuted,
  hudHidden,
  hud,
  onTogglePause,
  onToggleMute,
  onCycleCamera,
  onToggleHudHidden,
  onRestartRace,
  onReturnToTitle,
  onSelectNextStage,
  onTouchInput,
}) => {
  const stage = STAGES[stageId];
  const nextStageId =
    STAGE_ORDER[(STAGE_ORDER.indexOf(stageId) + 1) % STAGE_ORDER.length];

  const svgPath =
    hud.trackMapPath.length > 2
      ? `M ${hud.trackMapPath.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} Z`
      : '';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-6">
      {/* Center Countdown Banner */}
      {mode === 'countdown' && hud.countdownLabel && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div className="px-10 py-5 rounded-2xl bg-[#0e111c]/85 border border-white/15 text-center">
            <div className="font-display font-extrabold text-6xl md:text-7xl tracking-tight text-amber-300 font-mono-num">
              {hud.countdownLabel}
            </div>
            <div className="mt-1 text-xs font-medium text-stone-300">
              {stage.name} · {stage.subtitle}
            </div>
          </div>
        </div>
      )}

      {/* Top Perimeter Bar */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left: Position, Lap, Stage */}
        {!hudHidden ? (
          <div className="px-4 py-2.5 rounded-xl bg-[#0f1320]/85 border border-white/12 flex items-center gap-4">
            <div className="flex items-baseline gap-1">
              <span className="font-display font-extrabold text-2xl md:text-3xl text-amber-300 font-mono-num">
                {ordinal(hud.position)}
              </span>
              <span className="text-xs text-stone-400 font-mono-num">
                /{hud.totalRacers}
              </span>
            </div>
            <div className="h-6 w-px bg-white/12" />
            <div className="flex flex-col">
              <span className="text-xs text-stone-400">
                {stage.name}
              </span>
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-100 font-mono-num">
                <span>
                  Lap {hud.lap}/{hud.totalLaps}
                </span>
                <span aria-hidden="true" className="text-stone-500">·</span>
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  {hud.starsCollected}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div />
        )}

        {/* Top-Right: Race Timer & Utility Buttons */}
        <div className="flex items-center gap-2">
          {!hudHidden && (
            <div className="px-4 py-2.5 rounded-xl bg-[#0f1320]/85 border border-white/12 text-right">
              <div className="font-mono-num text-lg md:text-xl font-bold text-white leading-none">
                {formatTime(hud.raceTimeMs)}
              </div>
              <div className="mt-1 text-[11px] text-stone-400 font-mono-num">
                {hud.bestLapMs !== null
                  ? `Best ${formatTime(hud.bestLapMs)}`
                  : 'Lap Time'}
              </div>
            </div>
          )}

          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCycleCamera}
              title={`Camera: ${cameraMode} (C)`}
              className="px-3 py-2.5 rounded-xl bg-[#0f1320]/85 border border-white/12 text-stone-200 hover:bg-[#1a2035] transition-colors flex items-center gap-1.5 text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              <Camera className="w-4 h-4 text-sky-300" />
              <span className="hidden sm:inline capitalize">{cameraMode}</span>
            </button>
            <button
              type="button"
              onClick={onToggleHudHidden}
              title="Toggle HUD (H)"
              aria-label="Toggle HUD"
              className="p-2.5 rounded-xl bg-[#0f1320]/85 border border-white/12 text-stone-200 hover:bg-[#1a2035] transition-colors cursor-pointer"
            >
              {hudHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              title="Mute / Unmute (M)"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              className="p-2.5 rounded-xl bg-[#0f1320]/85 border border-white/12 text-stone-200 hover:bg-[#1a2035] transition-colors cursor-pointer"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-amber-300" />
              )}
            </button>
            <button
              type="button"
              onClick={onTogglePause}
              title="Pause (Esc)"
              aria-label="Pause race"
              className="p-2.5 rounded-xl bg-[#0f1320]/85 border border-white/12 text-stone-200 hover:bg-[#1a2035] transition-colors cursor-pointer"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Perimeter Bar: Minimap (Left), Touch Pad (Mobile), Speed & Boost (Right) */}
      {!hudHidden && (
        <div className="flex items-end justify-between gap-4">
          {/* Bottom-Left: Vector Track Minimap */}
          <div className="hidden sm:flex flex-col items-center p-2.5 rounded-xl bg-[#0f1320]/82 border border-white/12">
            <svg viewBox="0 0 100 100" className="w-24 h-24">
              {svgPath && (
                <>
                  <path
                    d={svgPath}
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="6"
                    strokeLinejoin="round"
                  />
                  <path
                    d={svgPath}
                    fill="none"
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </>
              )}
              {hud.rivalMapPositions.map((rp, idx) => (
                <circle
                  key={idx}
                  cx={rp.x}
                  cy={rp.y}
                  r="3.2"
                  fill="#94a3b8"
                  stroke="#0f1320"
                  strokeWidth="1"
                />
              ))}
              <circle
                cx={hud.playerMapPos.x}
                cy={hud.playerMapPos.y}
                r="4.6"
                fill={stage.accentCss}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </svg>
          </div>

          {/* Touch Controls for Mobile / Tablet Viewports */}
          <div className="flex md:hidden pointer-events-auto items-center justify-between flex-1 gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onPointerDown={() => onTouchInput({ left: true })}
                onPointerUp={() => onTouchInput({ left: false })}
                onPointerLeave={() => onTouchInput({ left: false })}
                className="w-12 h-12 rounded-xl bg-[#0f1320]/88 border border-white/15 text-white font-bold text-lg active:bg-white/20"
              >
                ◀
              </button>
              <button
                type="button"
                onPointerDown={() => onTouchInput({ right: true })}
                onPointerUp={() => onTouchInput({ right: false })}
                onPointerLeave={() => onTouchInput({ right: false })}
                className="w-12 h-12 rounded-xl bg-[#0f1320]/88 border border-white/15 text-white font-bold text-lg active:bg-white/20"
              >
                ▶
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onPointerDown={() => onTouchInput({ drift: true })}
                onPointerUp={() => onTouchInput({ drift: false })}
                onPointerLeave={() => onTouchInput({ drift: false })}
                className="px-3.5 h-12 rounded-xl bg-[#0f1320]/88 border border-sky-400/40 text-sky-300 font-semibold text-xs"
              >
                Drift
              </button>
              <button
                type="button"
                onPointerDown={() => onTouchInput({ throttle: true })}
                onPointerUp={() => onTouchInput({ throttle: false })}
                onPointerLeave={() => onTouchInput({ throttle: false })}
                className="px-4 h-12 rounded-xl bg-amber-400 text-stone-950 font-bold text-xs"
              >
                Gas
              </button>
            </div>
          </div>

          {/* Bottom-Right: Speedometer & Cozy Boost Gauge */}
          <div className="px-4 py-3 rounded-xl bg-[#0f1320]/85 border border-white/12 min-w-[196px]">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display font-extrabold text-3xl md:text-4xl text-white font-mono-num leading-none">
                  {hud.speedKmh}
                </span>
                <span className="text-xs font-medium text-stone-400">km/h</span>
              </div>
              <span className="text-xs font-medium text-sky-300 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                {hud.isBoosting
                  ? 'Boosting'
                  : hud.isDrifting
                    ? 'Drifting'
                    : hud.boostCharge >= 25
                      ? 'E / B Boost'
                      : 'Charge'}
              </span>
            </div>

            <div className="mt-2.5 h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  width: `${hud.boostCharge}%`,
                  backgroundColor: hud.isBoosting
                    ? '#38bdf8'
                    : hud.boostCharge >= 25
                      ? '#fbbf24'
                      : '#64748b',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {mode === 'paused' && (
        <div className="fixed inset-0 z-20 pointer-events-auto flex items-center justify-center bg-[#090b12]/72 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#121624] border border-white/15 p-6 flex flex-col gap-5">
            <div>
              <h2 className="font-display font-bold text-2xl text-white">
                Race Paused
              </h2>
              <p className="mt-1 text-xs text-stone-400">
                {stage.name} · Lap {hud.lap}/{hud.totalLaps}
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onTogglePause}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-display font-bold text-sm transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Resume Race</span>
              </button>
              <button
                type="button"
                onClick={onRestartRace}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1b2136] hover:bg-[#232b45] border border-white/10 text-stone-100 font-medium text-sm transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restart Stage</span>
              </button>
              <button
                type="button"
                onClick={onReturnToTitle}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-transparent hover:bg-white/5 border border-white/10 text-stone-300 font-medium text-sm transition-colors cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Stage Select</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Race Finished / Victory Modal */}
      {mode === 'finished' && (
        <div className="fixed inset-0 z-20 pointer-events-auto flex items-center justify-center bg-[#090b12]/72 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#121624] border border-white/15 p-6 flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-amber-300">
                  {stage.name} Complete
                </div>
                <h2 className="mt-1 font-display font-extrabold text-3xl text-white">
                  Finished {ordinal(hud.position)}
                </h2>
              </div>
              <div className="text-right">
                <div className="text-xs text-stone-400">Total Time</div>
                <div className="font-mono-num text-lg font-bold text-white">
                  {formatTime(hud.raceTimeMs)}
                </div>
              </div>
            </div>

            {/* Standings Table */}
            <div className="rounded-xl bg-[#0c0f19] border border-white/10 divide-y divide-white/8">
              {hud.finishStandings.map((row, idx) => (
                <div
                  key={row.name}
                  className={`flex items-center justify-between px-3.5 py-2.5 text-sm ${
                    row.isPlayer ? 'text-white font-semibold bg-white/5' : 'text-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono-num text-xs text-stone-400 w-6">
                      {ordinal(idx + 1)}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: row.colorCss }}
                    />
                    <span>{row.name}</span>
                  </div>
                  <span className="font-mono-num text-xs text-stone-300">
                    {formatTime(row.timeMs)}
                  </span>
                </div>
              ))}
            </div>

            {hud.bestLapMs !== null && (
              <div className="flex items-center justify-between text-xs text-stone-400 px-1">
                <span>Best Lap: {formatTime(hud.bestLapMs)}</span>
                <span>Stars Collected: {hud.starsCollected}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => onSelectNextStage(nextStageId)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-display font-bold text-sm transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Next: {STAGES[nextStageId].name}</span>
              </button>
              <button
                type="button"
                onClick={onRestartRace}
                className="px-4 py-3 rounded-xl bg-[#1b2136] hover:bg-[#232b45] border border-white/10 text-stone-100 font-medium text-sm transition-colors cursor-pointer"
              >
                Replay
              </button>
              <button
                type="button"
                onClick={onReturnToTitle}
                className="px-4 py-3 rounded-xl bg-transparent hover:bg-white/5 border border-white/10 text-stone-300 font-medium text-sm transition-colors cursor-pointer"
              >
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
