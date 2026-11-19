export type GamePhase = 'lobby' | 'countdown' | 'playing' | 'paused' | 'gameover';

export type ToolId = 'axe_survival' | 'axe_tactical' | 'pickaxe_alpine' | 'pickaxe_miner';

export type HotbarSlotId = 'tool' | 'campfire' | 'wood_wall' | 'wood_gate' | 'berries';

export interface CharacterSkin {
  id: string;
  name: string;
  subtitle: string;
  swatchPrimary: string;
  swatchSecondary: string;
  skinTone: string;
  hairColor: string;
  hatStyle: 'none' | 'beanie' | 'hood' | 'cap';
  hatColor: string;
  jacketColor: string;
  vestColor: string;
  hasTacticalVest: boolean;
  hasBackpack: boolean;
  hasHoodDown: boolean;
  pantsColor: string;
  bootsColor: string;
  packColor: string;
  pattern: 'solid' | 'flannel' | 'camo' | 'denim';
}

export interface ToolSpec {
  id: ToolId;
  kind: 'axe' | 'pickaxe';
  name: string;
  subtitle: string;
  handleColor: string;
  headColor: string;
  accentColor: string;
  woodDamage: number;
  stoneDamage: number;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  isLocal: boolean;
  ready: boolean;
  skinId: string;
  toolId: ToolId;
}

export interface SurvivalVitals {
  health: number;
  hunger: number;
  warmth: number;
  stamina: number;
}

export interface InventoryState {
  wood: number;
  stone: number;
  berries: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  countdown: number;
  vitals: SurvivalVitals;
  inventory: InventoryState;
  activeSlot: HotbarSlotId;
  dayNumber: number;
  timeOfDay: number; // 0..1 (0.25 = noon, 0.55 = dusk, 0.75 = midnight)
  timeLabel: string;
  promptText: string | null;
  promptSubtext: string | null;
  nearFire: boolean;
  treesChopped: number;
  wallsBuilt: number;
  campfiresLit: number;
  wolvesRepelled: number;
  buildRotationDeg: number;
  canPlaceBuild: boolean;
  toastMessage: string | null;
}

export const CHARACTER_SKINS: CharacterSkin[] = [
  {
    id: 'tactical_ranger',
    name: 'Éclaireur Tactique',
    subtitle: 'Gilet tactique noir matelassé & veste ardoise',
    swatchPrimary: '#363c42',
    swatchSecondary: '#15171a',
    skinTone: '#d6a485',
    hairColor: '#8f7758',
    hatStyle: 'none',
    hatColor: '#2a2f35',
    jacketColor: '#3a4046',
    vestColor: '#16181b',
    hasTacticalVest: true,
    hasBackpack: false,
    hasHoodDown: true,
    pantsColor: '#363b40',
    bootsColor: '#161719',
    packColor: '#2c322b',
    pattern: 'camo',
  },
  {
    id: 'denim_survivor',
    name: 'Survivant Solitaire',
    subtitle: 'Veste en jean sombre & pantalon cargo',
    swatchPrimary: '#27384c',
    swatchSecondary: '#4a3728',
    skinTone: '#e0b394',
    hairColor: '#241c18',
    hatStyle: 'none',
    hatColor: '#27384c',
    jacketColor: '#243547',
    vestColor: '#1e2833',
    hasTacticalVest: false,
    hasBackpack: true,
    hasHoodDown: false,
    pantsColor: '#3b3730',
    bootsColor: '#2a1e17',
    packColor: '#4a3d2e',
    pattern: 'denim',
  },
  {
    id: 'nordic_lumberjack',
    name: 'Bûcheron Nordique',
    subtitle: 'Chemise flanelle rouge & bonnet en laine',
    swatchPrimary: '#8c2323',
    swatchSecondary: '#2d241e',
    skinTone: '#dfad8c',
    hairColor: '#3d281b',
    hatStyle: 'beanie',
    hatColor: '#7a2520',
    jacketColor: '#8c2323',
    vestColor: '#2c221b',
    hasTacticalVest: true,
    hasBackpack: true,
    hasHoodDown: false,
    pantsColor: '#2b323b',
    bootsColor: '#2d1c12',
    packColor: '#57412b',
    pattern: 'flannel',
  },
  {
    id: 'forest_warden',
    name: 'Garde Forestier',
    subtitle: 'Capuche mousse & équipement de piste',
    swatchPrimary: '#364d36',
    swatchSecondary: '#5a4632',
    skinTone: '#c89270',
    hairColor: '#1b1614',
    hatStyle: 'hood',
    hatColor: '#2e422e',
    jacketColor: '#384f37',
    vestColor: '#4c3a28',
    hasTacticalVest: true,
    hasBackpack: true,
    hasHoodDown: false,
    pantsColor: '#363228',
    bootsColor: '#211912',
    packColor: '#3d4732',
    pattern: 'camo',
  },
  {
    id: 'alpine_scout',
    name: 'Pisteur Alpin',
    subtitle: 'Parka ocre & harnais d’expédition',
    swatchPrimary: '#b8762d',
    swatchSecondary: '#262b31',
    skinTone: '#e2b798',
    hairColor: '#4c3828',
    hatStyle: 'cap',
    hatColor: '#24292e',
    jacketColor: '#b36e27',
    vestColor: '#24292f',
    hasTacticalVest: true,
    hasBackpack: true,
    hasHoodDown: true,
    pantsColor: '#24282e',
    bootsColor: '#19191b',
    packColor: '#2c3138',
    pattern: 'solid',
  },
];

export const TOOL_SPECS: ToolSpec[] = [
  {
    id: 'axe_survival',
    kind: 'axe',
    name: 'Hache de Survie',
    subtitle: 'Manche frêne · Coupe rapide',
    handleColor: '#6b4528',
    headColor: '#8d969e',
    accentColor: '#3a291c',
    woodDamage: 28,
    stoneDamage: 8,
  },
  {
    id: 'axe_tactical',
    kind: 'axe',
    name: 'Hache Tactique',
    subtitle: 'Acier noirci · Puissance élevée',
    handleColor: '#23282c',
    headColor: '#3a4248',
    accentColor: '#b85d28',
    woodDamage: 34,
    stoneDamage: 10,
  },
  {
    id: 'pickaxe_alpine',
    kind: 'pickaxe',
    name: 'Pioche Alpine',
    subtitle: 'Acier forgé · Extraction roche',
    handleColor: '#5c3c24',
    headColor: '#7c8791',
    accentColor: '#8c3323',
    woodDamage: 14,
    stoneDamage: 34,
  },
  {
    id: 'pickaxe_miner',
    kind: 'pickaxe',
    name: 'Pioche de Mineur',
    subtitle: 'Double pointe · Polyvalente',
    handleColor: '#423326',
    headColor: '#4f5861',
    accentColor: '#c98a3a',
    woodDamage: 16,
    stoneDamage: 38,
  },
];

export const BUILD_COSTS: Record<'campfire' | 'wood_wall' | 'wood_gate', { wood: number; stone: number; label: string }> = {
  campfire: { wood: 4, stone: 2, label: 'Feu de camp' },
  wood_wall: { wood: 5, stone: 0, label: 'Mur en bois' },
  wood_gate: { wood: 6, stone: 0, label: 'Palissade haute' },
};
