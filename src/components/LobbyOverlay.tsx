import React from 'react';
import { Check, Clock, Hammer, Pickaxe, Shield, Volume2, VolumeX, Axe } from 'lucide-react';
import { CHARACTER_SKINS, LobbyPlayer, TOOL_SPECS, ToolId } from '../types/game';

interface LobbyOverlayProps {
  players: LobbyPlayer[];
  selectedSkinId: string;
  selectedToolId: ToolId;
  countdown: number;
  isCountdown: boolean;
  muted: boolean;
  onSelectSkin: (skinId: string) => void;
  onSelectTool: (toolId: ToolId) => void;
  onToggleReady: () => void;
  onToggleMute: () => void;
}

export const LobbyOverlay: React.FC<LobbyOverlayProps> = ({
  players,
  selectedSkinId,
  selectedToolId,
  countdown,
  isCountdown,
  muted,
  onSelectSkin,
  onSelectTool,
  onToggleReady,
  onToggleMute,
}) => {
  const localPlayer = players.find((p) => p.isLocal);
  const isReady = Boolean(localPlayer?.ready);
  const readyCount = players.filter((p) => p.ready).length;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-6">
      {/* Top Row: Title Lockup + Squad Readiness */}
      <div className="flex flex-wrap items-start justify-between gap-2.5 sm:gap-4">
        {/* Title Lockup */}
        <div className="pointer-events-auto rounded-xl border border-stone-700/60 bg-[#0d120e]/85 px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            <svg
              width="34"
              height="34"
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M18 3L27 15H22L29 25H7L14 15H9L18 3Z"
                fill="#4d7c4a"
                stroke="#d6b47a"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path d="M18 25V33" stroke="#9c6f44" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div>
              <h1 className="text-xl font-black tracking-wider text-stone-100 uppercase leading-none">
                Sylva Survie
              </h1>
              <p className="mt-1 text-xs font-medium tracking-wide text-amber-300/90">
                LOBBY DU CAMPEMENT · FORÊT BORÉALE
              </p>
            </div>
          </div>
        </div>

        {/* Squad Waiting Panel + Mute */}
        <div className="pointer-events-auto flex items-start gap-2.5">
          <div className="rounded-xl border border-stone-700/60 bg-[#0d120e]/85 px-3.5 py-2.5 shadow-lg">
            <div className="mb-2 flex items-center justify-between gap-4 border-b border-stone-800 pb-1.5">
              <span className="text-[11px] font-bold tracking-wider text-stone-400 uppercase">
                Survivants en attente
              </span>
              <span className="text-xs font-bold text-amber-300 tabular-nums">
                {readyCount}/{players.length} PRÊTS
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:flex sm:items-center sm:gap-3">
              {players.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
                    p.ready
                      ? 'border-emerald-700/70 bg-emerald-950/60 text-emerald-200'
                      : 'border-stone-700/60 bg-stone-900/70 text-stone-300'
                  }`}
                >
                  {p.ready ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  )}
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-[10px] uppercase opacity-75">
                    {p.ready ? 'Prêt' : 'Attente'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            title={muted ? 'Activer le son' : 'Couper le son'}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-700/60 bg-[#0d120e]/85 text-stone-200 transition-colors hover:border-amber-500/60 hover:text-amber-300 cursor-pointer"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Countdown Banner (only during 3..2..1) */}
      {isCountdown && (
        <div className="pointer-events-none flex flex-col items-center justify-center">
          <div className="rounded-2xl border border-amber-500/60 bg-[#0d120e]/90 px-8 py-4 text-center shadow-2xl">
            <p className="text-xs font-bold tracking-widest text-amber-300 uppercase">
              Déploiement dans la forêt
            </p>
            <div className="mt-1 text-5xl font-black text-white tabular-nums">{countdown}</div>
          </div>
        </div>
      )}

      {/* Bottom Dock: Skin + Tool + PRÊT CTA */}
      <div className="flex flex-col items-center gap-2">
        <div className="pointer-events-auto max-h-[45vh] overflow-y-auto w-full max-w-[960px] rounded-2xl border border-stone-700/70 bg-[#0d120e]/90 p-3 sm:p-3.5 shadow-2xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Skins Selector */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-stone-400 uppercase">
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                <span>Apparence du survivant</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {CHARACTER_SKINS.map((skin) => {
                  const active = skin.id === selectedSkinId;
                  return (
                    <button
                      key={skin.id}
                      type="button"
                      onClick={() => onSelectSkin(skin.id)}
                      className={`group flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-all cursor-pointer ${
                        active
                          ? 'border-amber-400 bg-amber-950/50 text-stone-100 shadow-sm'
                          : 'border-stone-700/60 bg-stone-900/70 text-stone-300 hover:border-stone-500'
                      }`}
                    >
                      <span
                        className="h-5 w-5 rounded-md border border-white/20 shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${skin.swatchPrimary} 55%, ${skin.swatchSecondary} 55%)`,
                        }}
                      />
                      <span className="text-xs font-semibold whitespace-nowrap">{skin.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tool Selector (Axe / Pickaxe) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-stone-400 uppercase">
                <Hammer className="h-3.5 w-3.5 text-amber-400" />
                <span>Outil visible en main</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TOOL_SPECS.map((tool) => {
                  const active = tool.id === selectedToolId;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => onSelectTool(tool.id)}
                      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                        active
                          ? 'border-amber-400 bg-amber-950/50 text-amber-200'
                          : 'border-stone-700/60 bg-stone-900/70 text-stone-300 hover:border-stone-500'
                      }`}
                    >
                      {tool.kind === 'axe' ? (
                        <Axe className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Pickaxe className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="whitespace-nowrap">{tool.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PRÊT Button */}
            <div className="flex items-center justify-end pt-1 lg:pt-0">
              <button
                type="button"
                onClick={onToggleReady}
                className={`min-w-[168px] rounded-xl border px-6 py-3 text-base font-black tracking-widest uppercase transition-all cursor-pointer ${
                  isReady
                    ? 'border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'border-amber-400 bg-amber-500 text-stone-950 hover:bg-amber-400'
                }`}
              >
                {isReady ? 'PRÊT ✓' : 'PRÊT'}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs font-medium text-stone-300/85 drop-shadow">
          Glisser la souris pour pivoter · Entrée pour lancer la partie
        </p>
      </div>
    </div>
  );
};
