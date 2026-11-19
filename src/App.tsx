import { useEffect, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { GameHud } from './components/GameHud';
import { LobbyOverlay } from './components/LobbyOverlay';
import { SurvivalEngine } from './game/survivalEngine';
import { HotbarSlotId, HudSnapshot, LobbyPlayer, ToolId } from './types/game';

const INITIAL_HUD: HudSnapshot = {
  phase: 'lobby',
  countdown: 0,
  vitals: { health: 100, hunger: 92, warmth: 88, stamina: 100 },
  inventory: { wood: 4, stone: 2, berries: 2 },
  activeSlot: 'tool',
  dayNumber: 1,
  timeOfDay: 0.26,
  timeLabel: 'Jour',
  promptText: null,
  promptSubtext: null,
  nearFire: true,
  treesChopped: 0,
  wallsBuilt: 0,
  campfiresLit: 0,
  wolvesRepelled: 0,
  buildRotationDeg: 0,
  canPlaceBuild: false,
  toastMessage: null,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SurvivalEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [selectedSkinId, setSelectedSkinId] = useState<string>('tactical_ranger');
  const [selectedToolId, setSelectedToolId] = useState<ToolId>('axe_survival');
  const [muted, setMuted] = useState<boolean>(false);
  const [showJoysticks, setShowJoysticks] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      window.innerWidth < 1024
    );
  });

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new SurvivalEngine(
      mount,
      (snapshot) => setHud(snapshot),
      (players) => {
        setLobbyPlayers(players);
        const local = players.find((p) => p.isLocal);
        if (local) setSelectedToolId(local.toolId);
      },
    );
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
      soundEngine.dispose();
    };
  }, []);

  const handleSelectSkin = (skinId: string) => {
    setSelectedSkinId(skinId);
    engineRef.current?.setSkin(skinId);
  };

  const handleSelectTool = (toolId: ToolId) => {
    setSelectedToolId(toolId);
    engineRef.current?.setTool(toolId);
  };

  const handleToggleTool = () => {
    engineRef.current?.toggleQuickToolKind();
  };

  const handleToggleReady = () => {
    engineRef.current?.toggleReady();
  };

  const handleToggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  };

  const handleToggleJoysticks = () => {
    setShowJoysticks((prev) => {
      const next = !prev;
      if (!next) engineRef.current?.setVirtualMove(0, 0);
      return next;
    });
  };

  const handleMove = (x: number, y: number) => {
    engineRef.current?.setVirtualMove(x, y);
  };

  const handleLookDelta = (dxRad: number, dyRad: number) => {
    engineRef.current?.addCameraLook(dxRad, dyRad);
  };

  const handleAction = () => {
    engineRef.current?.triggerAction();
  };

  const handleJump = () => {
    engineRef.current?.triggerJump();
  };

  const handlePickup = () => {
    engineRef.current?.triggerPickup();
  };

  const handleSelectSlot = (slot: HotbarSlotId) => {
    engineRef.current?.selectHotbarSlot(slot);
  };

  const handleRotateBuild = () => {
    engineRef.current?.rotateBuild();
  };

  const handlePause = () => {
    // Dispatch Escape key event to reuse engine pause handling cleanly
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  };

  const handleResume = () => {
    engineRef.current?.resumeGame();
  };

  const handleReturnLobby = () => {
    engineRef.current?.returnToLobby();
  };

  const handleRestart = () => {
    engineRef.current?.restartSurvival();
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b0f0c]">
      {/* Isolated WebGL Canvas Container */}
      <div ref={canvasMountRef} className="h-full w-full" />

      {/* Lobby UI Overlay */}
      {(hud.phase === 'lobby' || hud.phase === 'countdown') && (
        <LobbyOverlay
          players={lobbyPlayers}
          selectedSkinId={selectedSkinId}
          selectedToolId={selectedToolId}
          countdown={hud.countdown}
          isCountdown={hud.phase === 'countdown'}
          muted={muted}
          onSelectSkin={handleSelectSkin}
          onSelectTool={handleSelectTool}
          onToggleReady={handleToggleReady}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Playing / Paused / Game Over HUD */}
      {(hud.phase === 'playing' || hud.phase === 'paused' || hud.phase === 'gameover') && (
        <GameHud
          hud={hud}
          selectedToolId={selectedToolId}
          muted={muted}
          showJoysticks={showJoysticks}
          onToggleJoysticks={handleToggleJoysticks}
          onMove={handleMove}
          onLookDelta={handleLookDelta}
          onAction={handleAction}
          onJump={handleJump}
          onPickup={handlePickup}
          onSelectSlot={handleSelectSlot}
          onToggleTool={handleToggleTool}
          onRotateBuild={handleRotateBuild}
          onToggleMute={handleToggleMute}
          onPause={handlePause}
          onResume={handleResume}
          onReturnLobby={handleReturnLobby}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}
