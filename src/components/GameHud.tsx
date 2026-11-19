import React from 'react';
import {
  Axe,
  Flame,
  Gamepad2,
  Heart,
  Home,
  Moon,
  Pause,
  Pickaxe,
  Play,
  RotateCw,
  ShieldAlert,
  Sun,
  Trees,
  Utensils,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { BUILD_COSTS, HotbarSlotId, HudSnapshot, TOOL_SPECS, ToolId } from '../types/game';
import { MobileControls } from './MobileControls';

interface GameHudProps {
  hud: HudSnapshot;
  selectedToolId: ToolId;
  muted: boolean;
  showJoysticks: boolean;
  onToggleJoysticks: () => void;
  onMove: (x: number, y: number) => void;
  onLookDelta: (dxRad: number, dyRad: number) => void;
  onAction: () => void;
  onJump: () => void;
  onPickup: () => void;
  onSelectSlot: (slot: HotbarSlotId) => void;
  onToggleTool: () => void;
  onRotateBuild: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onResume: () => void;
  onReturnLobby: () => void;
  onRestart: () => void;
}

const VitalBar: React.FC<{
  label: string;
  value: number;
  colorClass: string;
  icon: React.ReactNode;
}> = ({ label, value, colorClass, icon }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2">
      <div className="flex w-20 items-center gap-1.5 text-[11px] font-semibold text-stone-300">
        {icon}
        <span>{label}</span>
      </div>
      <div className="h-2 w-28 overflow-hidden rounded-full bg-stone-800/90">
        <div className={`h-full transition-all duration-150 ${colorClass}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="w-7 text-right text-[11px] font-bold text-stone-200 tabular-nums">{clamped}</span>
    </div>
  );
};

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  selectedToolId,
  muted,
  showJoysticks,
  onToggleJoysticks,
  onMove,
  onLookDelta,
  onAction,
  onJump,
  onPickup,
  onSelectSlot,
  onToggleTool,
  onRotateBuild,
  onToggleMute,
  onPause,
  onResume,
  onReturnLobby,
  onRestart,
}) => {
  const toolSpec = TOOL_SPECS.find((t) => t.id === selectedToolId) || TOOL_SPECS[0];
  const isNight = hud.timeLabel === 'Nuit';

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2.5 sm:p-4">
      {/* Top Row: Vitals + Time/Controls */}
      <div className="flex items-start justify-between gap-4">
        {/* Survival Vitals */}
        <div className="rounded-xl border border-stone-700/60 bg-[#0d120e]/85 px-3.5 py-2.5 shadow-lg">
          <div className="mb-1.5 flex items-center justify-between gap-4 border-b border-stone-800 pb-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              {isNight ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              <span className="tabular-nums">
                Jour {hud.dayNumber} · {hud.timeLabel}
              </span>
            </div>
            {hud.nearFire && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-orange-400">
                <Flame className="h-3 w-3" />
                Au chaud
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <VitalBar
              label="Santé"
              value={hud.vitals.health}
              colorClass="bg-emerald-500"
              icon={<Heart className="h-3 w-3 text-emerald-400" />}
            />
            <VitalBar
              label="Faim"
              value={hud.vitals.hunger}
              colorClass="bg-amber-500"
              icon={<Utensils className="h-3 w-3 text-amber-400" />}
            />
            <VitalBar
              label="Chaleur"
              value={hud.vitals.warmth}
              colorClass="bg-orange-500"
              icon={<Flame className="h-3 w-3 text-orange-400" />}
            />
            <VitalBar
              label="Énergie"
              value={hud.vitals.stamina}
              colorClass="bg-sky-400"
              icon={<Zap className="h-3 w-3 text-sky-300" />}
            />
          </div>
        </div>

        {/* Toast notification (Top Center) */}
        {hud.toastMessage && (
          <div className="hidden sm:block rounded-xl border border-amber-500/50 bg-[#0d120e]/90 px-4 py-2 text-xs font-bold text-amber-200 shadow-lg">
            {hud.toastMessage}
          </div>
        )}

        {/* Top-right Quick Actions & Resources Summary */}
        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden md:flex items-center gap-3 rounded-xl border border-stone-700/60 bg-[#0d120e]/85 px-3.5 py-2 text-xs font-bold shadow-lg">
              <span className="text-amber-200 tabular-nums">Bois : {hud.inventory.wood}</span>
              <span className="text-stone-300 tabular-nums">Pierre : {hud.inventory.stone}</span>
              <span className="text-rose-300 tabular-nums">Baies : {hud.inventory.berries}</span>
            </div>

            <button
              type="button"
              onClick={onToggleJoysticks}
              title="Afficher / masquer les joysticks tactiles"
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-2 text-xs font-bold shadow-lg cursor-pointer ${
                showJoysticks
                  ? 'border-amber-400/70 bg-amber-950/60 text-amber-200'
                  : 'border-stone-700/60 bg-[#0d120e]/85 text-stone-300 hover:border-amber-400/60'
              }`}
            >
              <Gamepad2 className="h-4 w-4" />
              <span className="hidden sm:inline">Joysticks</span>
            </button>

            <button
              type="button"
              onClick={onToggleTool}
              title="Changer Hache / Pioche [Tab]"
              className="flex items-center gap-1.5 rounded-xl border border-stone-700/60 bg-[#0d120e]/85 px-2.5 sm:px-3 py-2 text-xs font-bold text-stone-200 hover:border-amber-400/60 hover:text-amber-300 cursor-pointer"
            >
              {toolSpec.kind === 'axe' ? <Axe className="h-4 w-4" /> : <Pickaxe className="h-4 w-4" />}
              <span className="hidden sm:inline">{toolSpec.kind === 'axe' ? 'Hache' : 'Pioche'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-stone-700/60 bg-[#0d120e]/85 text-stone-200 hover:border-amber-400/60 cursor-pointer"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={onPause}
              title="Menu [Échap]"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-stone-700/60 bg-[#0d120e]/85 text-stone-200 hover:border-amber-400/60 cursor-pointer"
            >
              <Pause className="h-4 w-4" />
            </button>
          </div>

          {/* Compact mobile resources readout */}
          <div className="flex md:hidden items-center gap-2.5 rounded-xl border border-stone-700/60 bg-[#0d120e]/85 px-2.5 py-1 text-[11px] font-bold shadow-lg">
            <span className="text-amber-200 tabular-nums">Bois {hud.inventory.wood}</span>
            <span className="text-stone-300 tabular-nums">Pierre {hud.inventory.stone}</span>
            <span className="text-rose-300 tabular-nums">Baies {hud.inventory.berries}</span>
          </div>
        </div>
      </div>

      {/* Center Contextual Prompt + Subtle Crosshair */}
      <div className="flex flex-col items-center justify-center gap-2">
        {hud.phase === 'playing' && (
          <div className="h-1.5 w-1.5 rounded-full bg-white/75 shadow" />
        )}
        {hud.promptText && (
          <div className="rounded-xl border border-stone-600/70 bg-[#0d120e]/88 px-3.5 py-1.5 text-center shadow-lg">
            <div className="text-xs font-bold text-stone-100">{hud.promptText}</div>
            {hud.promptSubtext && (
              <div className="mt-0.5 text-[11px] font-medium text-amber-300/90">{hud.promptSubtext}</div>
            )}
          </div>
        )}
      </div>

      {/* Virtual Dual Joysticks + Mobile Touch Buttons */}
      {hud.phase === 'playing' && showJoysticks && (
        <MobileControls
          activeSlot={hud.activeSlot}
          selectedToolId={selectedToolId}
          onMove={onMove}
          onLookDelta={onLookDelta}
          onAction={onAction}
          onJump={onJump}
          onPickup={onPickup}
          onRotateBuild={onRotateBuild}
        />
      )}

      {/* Bottom Hotbar & Controls Hint */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="pointer-events-auto flex max-w-[96vw] items-center justify-start sm:justify-center gap-1.5 sm:gap-2 overflow-x-auto rounded-2xl border border-stone-700/70 bg-[#0d120e]/90 p-1.5 sm:p-2 shadow-2xl">
          {/* Slot 1: Tool */}
          <button
            type="button"
            onClick={() => onSelectSlot('tool')}
            className={`flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-xl border px-2.5 sm:px-3 py-1.5 sm:py-2 text-left transition-all cursor-pointer ${
              hud.activeSlot === 'tool'
                ? 'border-amber-400 bg-amber-950/60 text-amber-100'
                : 'border-stone-700/60 bg-stone-900/70 text-stone-300 hover:border-stone-500'
            }`}
          >
            <span className="hidden sm:inline text-[10px] font-black text-stone-400">1</span>
            {toolSpec.kind === 'axe' ? (
              <Axe className="h-4 w-4 text-amber-300" />
            ) : (
              <Pickaxe className="h-4 w-4 text-sky-300" />
            )}
            <div className="leading-tight">
              <div className="text-[11px] sm:text-xs font-bold">{toolSpec.kind === 'axe' ? 'Hache' : 'Pioche'}</div>
              <div className="hidden sm:block text-[10px] text-stone-400">[Tab] Changer</div>
            </div>
          </button>

          {/* Slot 2: Campfire */}
          <button
            type="button"
            onClick={() => onSelectSlot('campfire')}
            className={`flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-xl border px-2.5 sm:px-3 py-1.5 sm:py-2 text-left transition-all cursor-pointer ${
              hud.activeSlot === 'campfire'
                ? 'border-amber-400 bg-amber-950/60 text-amber-100'
                : 'border-stone-700/60 bg-stone-900/70 text-stone-300 hover:border-stone-500'
            }`}
          >
            <span className="hidden sm:inline text-[10px] font-black text-stone-400">2</span>
            <Flame className="h-4 w-4 text-orange-400" />
            <div className="leading-tight">
              <div className="text-[11px] sm:text-xs font-bold">Feu</div>
              <div className="text-[10px] text-stone-400 tabular-nums">
                {BUILD_COSTS.campfire.wood}B · {BUILD_COSTS.campfire.stone}P
              </div>
            </div>
          </button>

          {/* Slot 3: Wood Wall */}
          <button
            type="button"
            onClick={() => onSelectSlot('wood_wall')}
            className={`flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-xl border px-2.5 sm:px-3 py-1.5 sm:py-2 text-left transition-all cursor-pointer ${
              hud.activeSlot === 'wood_wall'
                ? 'border-amber-400 bg-amber-950/60 text-amber-100'
                : 'border-stone-700/60 bg-stone-900/70 text-stone-300 hover:border-stone-500'
            }`}
          >
            <span className="hidden sm:inline text-[10px] font-black text-stone-400">3</span>
            <Trees className="h-4 w-4 text-amber-400" />
            <div className="leading-tight">
              <div className="text-[11px] sm:text-xs font-bold">Mur bois</div>
              <div className="text-[10px] text-stone-400 tabular-nums">{BUILD_COSTS.wood_wall.wood} Bois</div>
            </div>
          </button>

          {/* Slot 4: High Palisade */}
          <button
            type="button"
            onClick={() => onSelectSlot('wood_gate')}
            className={`flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-xl border px-2.5 sm:px-3 py-1.5 sm:py-2 text-left transition-all cursor-pointer ${
              hud.activeSlot === 'wood_gate'
                ? 'border-amber-400 bg-amber-950/60 text-amber-100'
                : 'border-stone-700/60 bg-stone-900/70 text-stone-300 hover:border-stone-500'
            }`}
          >
            <span className="hidden sm:inline text-[10px] font-black text-stone-400">4</span>
            <ShieldAlert className="h-4 w-4 text-emerald-400" />
            <div className="leading-tight">
              <div className="text-[11px] sm:text-xs font-bold">Palissade</div>
              <div className="text-[10px] text-stone-400 tabular-nums">{BUILD_COSTS.wood_gate.wood} Bois</div>
            </div>
          </button>

          {/* Slot 5: Eat Berries */}
          <button
            type="button"
            onClick={() => onSelectSlot('berries')}
            className="flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-xl border border-stone-700/60 bg-stone-900/70 px-2.5 sm:px-3 py-1.5 sm:py-2 text-left text-stone-300 transition-all hover:border-rose-400/70 hover:text-rose-100 cursor-pointer"
          >
            <span className="hidden sm:inline text-[10px] font-black text-stone-400">5</span>
            <Utensils className="h-4 w-4 text-rose-400" />
            <div className="leading-tight">
              <div className="text-[11px] sm:text-xs font-bold">Baies ({hud.inventory.berries})</div>
              <div className="hidden sm:block text-[10px] text-stone-400">+28 Faim</div>
            </div>
          </button>

          {(hud.activeSlot === 'wood_wall' || hud.activeSlot === 'wood_gate') && (
            <button
              type="button"
              onClick={onRotateBuild}
              title="Pivoter [R]"
              className="flex shrink-0 items-center gap-1 rounded-xl border border-amber-500/50 bg-amber-950/40 px-2.5 py-2 text-xs font-bold text-amber-200 cursor-pointer"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span className="tabular-nums">{hud.buildRotationDeg}°</span>
            </button>
          )}
        </div>

        <p className="hidden md:block text-center text-[11px] font-medium text-stone-300/80 drop-shadow">
          ZQSD / WASD Déplacer · Shift Courir · Clic / F Couper ou Construire · E Ramasser · Tab Hache/Pioche · Échap Pause
        </p>
      </div>

      {/* Pause Modal */}
      {hud.phase === 'paused' && (
        <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-700 bg-[#101612] p-6 shadow-2xl">
            <h2 className="text-2xl font-black tracking-wide text-stone-100 uppercase">Partie en pause</h2>
            <p className="mt-1 text-sm text-stone-400">
              Jour {hud.dayNumber} · {hud.treesChopped} arbres abattus · {hud.wallsBuilt} murs construits
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2.5 rounded-xl border border-stone-800 bg-stone-900/60 p-3 text-xs text-stone-300">
              <div>
                <span className="font-bold text-amber-300">Bois :</span>{' '}
                <span className="tabular-nums">{hud.inventory.wood}</span>
              </div>
              <div>
                <span className="font-bold text-stone-200">Pierre :</span>{' '}
                <span className="tabular-nums">{hud.inventory.stone}</span>
              </div>
              <div>
                <span className="font-bold text-orange-300">Feux allumés :</span>{' '}
                <span className="tabular-nums">{hud.campfiresLit}</span>
              </div>
              <div>
                <span className="font-bold text-emerald-300">Loups repoussés :</span>{' '}
                <span className="tabular-nums">{hud.wolvesRepelled}</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onResume}
                className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-black tracking-wider text-stone-950 uppercase hover:bg-amber-400 cursor-pointer"
              >
                <Play className="h-4 w-4" />
                Reprendre la survie
              </button>
              <button
                type="button"
                onClick={onReturnLobby}
                className="flex items-center justify-center gap-2 rounded-xl border border-stone-700 bg-stone-900 px-4 py-2.5 text-sm font-bold text-stone-200 hover:border-stone-500 cursor-pointer"
              >
                <Home className="h-4 w-4" />
                Retourner au lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {hud.phase === 'gameover' && (
        <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-800/70 bg-[#121110] p-6 text-center shadow-2xl">
            <h2 className="text-2xl font-black tracking-wide text-rose-400 uppercase">Vous avez succombé</h2>
            <p className="mt-2 text-sm text-stone-300">
              Vous avez survécu jusqu’au <strong className="text-white">Jour {hud.dayNumber}</strong> dans la forêt.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-stone-800 bg-stone-900/70 p-3 text-xs">
              <div>
                <div className="text-stone-400">Arbres</div>
                <div className="mt-0.5 text-base font-black text-amber-300 tabular-nums">{hud.treesChopped}</div>
              </div>
              <div>
                <div className="text-stone-400">Murs</div>
                <div className="mt-0.5 text-base font-black text-emerald-300 tabular-nums">{hud.wallsBuilt}</div>
              </div>
              <div>
                <div className="text-stone-400">Feux</div>
                <div className="mt-0.5 text-base font-black text-orange-400 tabular-nums">{hud.campfiresLit}</div>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onRestart}
                className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-black tracking-wider text-stone-950 uppercase hover:bg-amber-400 cursor-pointer"
              >
                Recommencer la survie
              </button>
              <button
                type="button"
                onClick={onReturnLobby}
                className="rounded-xl border border-stone-700 bg-stone-900 px-4 py-2.5 text-sm font-bold text-stone-200 hover:border-stone-500 cursor-pointer"
              >
                Retourner au lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
