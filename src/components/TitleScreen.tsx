import React from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { CAR_COLORS, STAGE_ORDER, STAGES, StageId } from '../game/types';

interface TitleScreenProps {
  selectedStage: StageId;
  selectedCarColor: string;
  isMuted: boolean;
  onSelectStage: (stage: StageId) => void;
  onSelectCarColor: (colorId: string) => void;
  onStartRace: () => void;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  selectedStage,
  selectedCarColor,
  isMuted,
  onSelectStage,
  onSelectCarColor,
  onStartRace,
  onToggleMute,
}) => {
  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 md:p-10">
      {/* Left-weighted subtle contrast scrim leaving right 60%+ live 3D car & world open */}
      <div
        className="fixed inset-y-0 left-0 w-full md:w-[52%] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(10,12,20,0.88) 0%, rgba(10,12,20,0.62) 62%, rgba(10,12,20,0) 100%)',
        }}
      />

      {/* Top Audio Control */}
      <div className="relative z-10 flex items-center justify-between w-full">
        <div className="text-xs font-medium tracking-wide text-stone-300/90">
          3-Stage Cozy Circuit
        </div>
        <button
          type="button"
          onClick={onToggleMute}
          className="pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#121624]/90 border border-white/15 text-stone-100 hover:bg-[#1b2034] transition-colors text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
          aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-amber-300" />}
          <span>{isMuted ? 'Muted' : 'Sound On'}</span>
        </button>
      </div>

      {/* Left Column: Bespoke SVG Lockup + Stage Selector + Car Paint + Start CTA */}
      <div className="relative z-10 max-w-md flex flex-col gap-6 my-auto">
        {/* Bespoke Inline SVG Title Lockup */}
        <div className="flex flex-col gap-2.5">
          <svg
            viewBox="0 0 360 74"
            className="w-72 md:w-84 h-auto overflow-visible"
            role="img"
            aria-label="Solstice Drift"
          >
            {/* Sunlit horizon & winding ribbon emblem */}
            <circle cx="28" cy="36" r="20" fill="#f59e0b" fillOpacity="0.22" />
            <circle cx="28" cy="36" r="13" fill="#fbbf24" />
            <path
              d="M8 48 C18 39, 34 45, 50 31"
              fill="none"
              stroke="#fafaf9"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M11 54 C21 47, 36 51, 52 39"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeOpacity="0.9"
            />
            <text
              x="64"
              y="36"
              fill="#fafaf9"
              fontFamily="Outfit, sans-serif"
              fontSize="33"
              fontWeight="800"
              letterSpacing="-0.02em"
            >
              Solstice Drift
            </text>
            <text
              x="66"
              y="56"
              fill="#cbd5e1"
              fontFamily="Plus Jakarta Sans, sans-serif"
              fontSize="12.5"
              fontWeight="500"
              letterSpacing="0.04em"
            >
              Sunstone Canyon · Frostpine Pass · Lantern Harbor
            </text>
          </svg>
        </div>

        {/* 3 Stage Selector */}
        <div className="pointer-events-auto flex flex-col gap-2">
          <div className="text-xs font-medium text-stone-300/90">
            Select Stage
          </div>
          <div className="flex flex-col gap-2">
            {STAGE_ORDER.map((id, idx) => {
              const st = STAGES[id];
              const active = selectedStage === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectStage(id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#1a2033]/95 border-amber-400/70 text-white'
                      : 'bg-[#10131e]/82 border-white/10 text-stone-300 hover:bg-[#171c2d]/90 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: st.accentCss }}
                      />
                      <span className="font-display font-semibold text-sm md:text-base">
                        0{idx + 1}. {st.name}
                      </span>
                    </div>
                    <span className="text-xs text-stone-400 whitespace-nowrap shrink-0">
                      {st.subtitle}
                    </span>
                  </div>
                  {active && (
                    <p className="mt-1.5 text-xs text-stone-300/85 leading-relaxed pl-5">
                      {st.tagline}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Car Paint Finish Swatches */}
        <div className="pointer-events-auto flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl bg-[#10131e]/85 border border-white/10">
          <span className="text-xs font-medium text-stone-300 whitespace-nowrap">
            Car Finish
          </span>
          <div className="flex items-center gap-2.5">
            {CAR_COLORS.map((c) => {
              const active = selectedCarColor === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectCarColor(c.id)}
                  title={c.name}
                  aria-label={c.name}
                  className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                    active
                      ? 'border-white scale-110'
                      : 'border-white/25 hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.cssHex }}
                />
              );
            })}
          </div>
        </div>

        {/* Primary Start CTA */}
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onStartRace}
            className="flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-stone-950 font-display font-bold text-base transition-all cursor-pointer whitespace-nowrap"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start Race</span>
          </button>
        </div>
      </div>

      {/* Single Flat Control-Hint Line */}
      <div className="relative z-10 text-xs text-stone-300/85 tracking-wide">
        WASD / Arrows Drive · Space Drift · E / B Boost · C Camera · Esc Pause
      </div>
    </div>
  );
};
