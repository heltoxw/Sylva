import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Axe, Eye, Hammer, Hand, Pickaxe, RotateCw } from 'lucide-react';
import { HotbarSlotId, ToolId } from '../types/game';

interface MobileControlsProps {
  activeSlot: HotbarSlotId;
  selectedToolId: ToolId;
  onMove: (x: number, y: number) => void;
  onLookDelta: (dxRad: number, dyRad: number) => void;
  onAction: () => void;
  onJump: () => void;
  onPickup: () => void;
  onRotateBuild: () => void;
}

interface StickThumb {
  dx: number;
  dy: number;
  active: boolean;
  sprinting: boolean;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  activeSlot,
  selectedToolId,
  onMove,
  onLookDelta,
  onAction,
  onJump,
  onPickup,
  onRotateBuild,
}) => {
  const moveBaseRef = useRef<HTMLDivElement | null>(null);
  const movePointerId = useRef<number | null>(null);
  const [moveThumb, setMoveThumb] = useState<StickThumb>({
    dx: 0,
    dy: 0,
    active: false,
    sprinting: false,
  });

  const lookBaseRef = useRef<HTMLDivElement | null>(null);
  const lookPointerId = useRef<number | null>(null);
  const lookVecRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [lookThumb, setLookThumb] = useState<{ dx: number; dy: number; active: boolean }>({
    dx: 0,
    dy: 0,
    active: false,
  });

  const onLookDeltaRef = useRef(onLookDelta);
  onLookDeltaRef.current = onLookDelta;

  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  // Continuous camera rotation loop while right look joystick is deflected
  useEffect(() => {
    let rafId = 0;
    let prev = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const vx = lookVecRef.current.x;
      const vy = lookVecRef.current.y;
      if (Math.abs(vx) > 0.08 || Math.abs(vy) > 0.08) {
        onLookDeltaRef.current(vx * 2.5 * dt, vy * 1.55 * dt);
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId);
      onMoveRef.current(0, 0);
    };
  }, []);

  const updateMoveStick = (clientX: number, clientY: number) => {
    const el = moveBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxRadius = rect.width * 0.4;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let rx = clientX - cx;
    let ry = clientY - cy;
    const dist = Math.hypot(rx, ry);
    if (dist > maxRadius) {
      rx = (rx / dist) * maxRadius;
      ry = (ry / dist) * maxRadius;
    }

    const normX = rx / maxRadius;
    const normY = -ry / maxRadius; // Pushing up = +1 forward
    const mag = Math.hypot(normX, normY);

    setMoveThumb({
      dx: rx,
      dy: ry,
      active: true,
      sprinting: mag > 0.84,
    });
    onMove(normX, normY);
  };

  const resetMoveStick = () => {
    movePointerId.current = null;
    setMoveThumb({ dx: 0, dy: 0, active: false, sprinting: false });
    onMove(0, 0);
  };

  const updateLookStick = (clientX: number, clientY: number) => {
    const el = lookBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxRadius = rect.width * 0.4;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let rx = clientX - cx;
    let ry = clientY - cy;
    const dist = Math.hypot(rx, ry);
    if (dist > maxRadius) {
      rx = (rx / dist) * maxRadius;
      ry = (ry / dist) * maxRadius;
    }

    lookVecRef.current = { x: rx / maxRadius, y: ry / maxRadius };
    setLookThumb({ dx: rx, dy: ry, active: true });
  };

  const resetLookStick = () => {
    lookPointerId.current = null;
    lookVecRef.current = { x: 0, y: 0 };
    setLookThumb({ dx: 0, dy: 0, active: false });
  };

  const isBuilding = activeSlot !== 'tool';
  const isAxe = selectedToolId.startsWith('axe');
  const actionLabel = isBuilding ? 'Poser' : isAxe ? 'Couper' : 'Miner';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 sm:bottom-24 z-20 flex items-end justify-between px-4 sm:px-6">
      {/* Left Virtual Movement Joystick */}
      <div className="pointer-events-auto flex flex-col items-center gap-1.5 select-none">
        <div
          ref={moveBaseRef}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (movePointerId.current !== null) return;
            movePointerId.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateMoveStick(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
            if (e.pointerId !== movePointerId.current) return;
            updateMoveStick(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            if (e.pointerId === movePointerId.current) resetMoveStick();
          }}
          onPointerCancel={(e) => {
            e.stopPropagation();
            if (e.pointerId === movePointerId.current) resetMoveStick();
          }}
          className={`relative flex h-28 w-28 sm:h-32 sm:w-32 touch-none items-center justify-center rounded-full border-2 shadow-2xl transition-colors ${
            moveThumb.active
              ? moveThumb.sprinting
                ? 'border-amber-400/90 bg-[#0d120e]/85'
                : 'border-emerald-400/80 bg-[#0d120e]/80'
              : 'border-stone-500/50 bg-[#0d120e]/65'
          }`}
        >
          {/* Outer Sprint Threshold Ring */}
          <div className="pointer-events-none absolute inset-3 rounded-full border border-dashed border-stone-500/35" />

          {/* Directional Guides */}
          <span className="pointer-events-none absolute top-1.5 text-[9px] font-black text-stone-400/80">▲</span>
          <span className="pointer-events-none absolute bottom-1.5 text-[9px] font-black text-stone-400/80">▼</span>
          <span className="pointer-events-none absolute left-2 text-[9px] font-black text-stone-400/80">◄</span>
          <span className="pointer-events-none absolute right-2 text-[9px] font-black text-stone-400/80">►</span>

          {/* Movable Thumb Knob */}
          <div
            style={{ transform: `translate(${moveThumb.dx}px, ${moveThumb.dy}px)` }}
            className={`pointer-events-none flex h-12 w-12 items-center justify-center rounded-full border-2 shadow-lg ${
              moveThumb.sprinting
                ? 'border-amber-200 bg-amber-500/90 text-stone-950'
                : moveThumb.active
                  ? 'border-emerald-200 bg-emerald-500/85 text-stone-950'
                  : 'border-stone-300/70 bg-stone-700/85 text-stone-100'
            }`}
          >
            <div className="h-3 w-3 rounded-full bg-white/80" />
          </div>
        </div>
        <span className="rounded-md bg-[#0d120e]/75 px-2 py-0.5 text-[10px] font-bold tracking-wide text-stone-300 uppercase">
          {moveThumb.sprinting ? 'Sprint' : 'Avancer'}
        </span>
      </div>

      {/* Right Action Buttons + Camera Look Joystick */}
      <div className="pointer-events-auto flex items-end gap-3 select-none">
        {/* Vertical Stack: Pickup + Jump + Rotate */}
        <div className="flex flex-col items-center gap-2.5 pb-1">
          {(activeSlot === 'wood_wall' || activeSlot === 'wood_gate') && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                onRotateBuild();
              }}
              className="flex h-11 w-11 touch-none items-center justify-center rounded-full border border-amber-400/70 bg-[#0d120e]/85 text-amber-200 shadow-lg active:scale-95 cursor-pointer"
              title="Pivoter"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onPickup();
            }}
            className="flex h-11 w-11 touch-none flex-col items-center justify-center rounded-full border border-stone-500/60 bg-[#0d120e]/80 text-stone-100 shadow-lg active:scale-95 cursor-pointer"
            title="Ramasser"
          >
            <Hand className="h-4 w-4 text-emerald-300" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onJump();
            }}
            className="flex h-12 w-12 touch-none flex-col items-center justify-center rounded-full border border-stone-500/60 bg-[#0d120e]/80 text-stone-100 shadow-lg active:scale-95 cursor-pointer"
            title="Sauter"
          >
            <ArrowUp className="h-4 w-4 text-sky-300" />
            <span className="text-[8px] font-black uppercase text-stone-300">Saut</span>
          </button>
        </div>

        {/* Camera Stick + Primary Chop/Build Button */}
        <div className="flex flex-col items-center gap-2.5">
          {/* Primary Action Button */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onAction();
            }}
            className={`flex h-14 w-14 touch-none flex-col items-center justify-center rounded-full border-2 shadow-xl active:scale-95 cursor-pointer ${
              isBuilding
                ? 'border-emerald-300 bg-emerald-600/90 text-white'
                : 'border-amber-300 bg-amber-500/90 text-stone-950'
            }`}
            title={actionLabel}
          >
            {isBuilding ? (
              <Hammer className="h-5 w-5" />
            ) : isAxe ? (
              <Axe className="h-5 w-5" />
            ) : (
              <Pickaxe className="h-5 w-5" />
            )}
            <span className="mt-0.5 text-[9px] font-black uppercase">{actionLabel}</span>
          </button>

          {/* Right Look Joystick */}
          <div className="flex flex-col items-center gap-1">
            <div
              ref={lookBaseRef}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (lookPointerId.current !== null) return;
                lookPointerId.current = e.pointerId;
                e.currentTarget.setPointerCapture(e.pointerId);
                updateLookStick(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                e.stopPropagation();
                if (e.pointerId !== lookPointerId.current) return;
                updateLookStick(e.clientX, e.clientY);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (e.pointerId === lookPointerId.current) resetLookStick();
              }}
              onPointerCancel={(e) => {
                e.stopPropagation();
                if (e.pointerId === lookPointerId.current) resetLookStick();
              }}
              className={`relative flex h-24 w-24 sm:h-28 sm:w-28 touch-none items-center justify-center rounded-full border-2 shadow-2xl transition-colors ${
                lookThumb.active
                  ? 'border-sky-400/85 bg-[#0d120e]/85'
                  : 'border-stone-500/50 bg-[#0d120e]/65'
              }`}
            >
              <div className="pointer-events-none absolute inset-3 rounded-full border border-stone-600/40" />
              <div
                style={{ transform: `translate(${lookThumb.dx}px, ${lookThumb.dy}px)` }}
                className={`pointer-events-none flex h-10 w-10 items-center justify-center rounded-full border-2 shadow-lg ${
                  lookThumb.active
                    ? 'border-sky-200 bg-sky-500/90 text-stone-950'
                    : 'border-stone-300/70 bg-stone-700/85 text-stone-100'
                }`}
              >
                <Eye className="h-4 w-4" />
              </div>
            </div>
            <span className="rounded-md bg-[#0d120e]/75 px-2 py-0.5 text-[10px] font-bold tracking-wide text-stone-300 uppercase">
              Caméra
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
