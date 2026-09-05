export type BaseTowerId = 'ruby' | 'topaz' | 'sapphire' | 'emerald' | 'aquamarine' | 'amethyst' | 'diamond' | 'opal'
export type TowerId = BaseTowerId | 'rock'
export type Tower = { type: string; quality?: number; unitId?: string; name?: string; temporary?: boolean; ownerId?: string; fixed?: boolean; abilities?: string[] }
export type User = { name: string; color: string }
export type Cell = { x: number; z: number }
export type RoutePoint = Cell & { id: string; label: string; kind: 'start' | 'waypoint' | 'end' }
export type BuildPhase = 'idle' | 'placing' | 'choosing'
export type PlayerBuildState = { wave: number; playerLevel: number; phase: BuildPhase; pendingKeys: string[] }
export type KeepOption = { id: string; label: string; detail: string; targetKey: string; result: Tower }
export type BattleCombineOption = KeepOption & { ingredientKeys: string[]; ingredientUnitIds: string[] }
export type TowerAuraEffect = {
  id: string
  name: string
  description: string
  kind: 'buff' | 'debuff'
  sourceKey: string
  sourceName: string
}
export type MonsterStatusEffect = {
  id: string
  name: string
  kind: 'buff' | 'debuff' | 'status'
  detail?: string
}

export type BattleMonster = {
  id: number
  name: string
  x: number
  z: number
  hp: number
  maxHp: number
  armor: number
  baseArmor: number
  magicResistancePercent?: number
  speed: number
  effectiveSpeed: number
  distance: number
  flying: boolean
  boss: boolean
  abilities?: string[]
  physicalImmune?: boolean
  magicImmune?: boolean
  invisible?: boolean
  cloaked?: boolean
  refractionCharges?: number
  evasionPercent?: number
  bountyGold?: number
  bountyExperience?: number
  statuses?: MonsterStatusEffect[]
}
export type BattleProjectile = { id: number; towerKey: string; targetId: number; fromX: number; fromZ: number; launchAt: number; impactAt: number; color: string }
export type BattleSnapshot = {
  type: 'snapshot'
  serverTime: number
  phase: 'build' | 'combat'
  wave: number
  tick: number
  lives: number
  kills: number
  gold: number
  experience: number
  heroLevel: number
  nextLevelExperience: number
  playerCount: number
  spawned: number
  spawnCount: number
  resetVersion: number
  resetKind: 'none' | 'wave' | 'game' | 'load'
  monsters: BattleMonster[]
  projectiles: BattleProjectile[]
  newCombatEvents?: CombatEvent[]
}

export type CombatEventDebuff = { kind: 'slow' | 'armorBreak' | 'poison' | 'stun'; level: number }

export type CombatEvent = {
  id: number
  at: number
  wave: number
  tick: number
  towerKey: string
  towerType: string
  towerQuality?: number
  towerName?: string
  monsterId: number
  monsterName: string
  damage: number
  damageType?: 'physical' | 'magical'
  killed: boolean
  gold?: number
  greedProc?: boolean
  debuffs: CombatEventDebuff[]
}

export type CombatEventsMessage = {
  type: 'combatEvents'
  events: CombatEvent[]
}

export type LeaderboardEntry = {
  key: string
  type: string
  quality?: number
  unitId?: string
  name?: string
  damage: number
  kills: number
}

export type LeaderboardMessage = {
  type: 'leaderboard'
  wave: number | 'all'
  availableWaves: number[]
  entries: LeaderboardEntry[]
}

export type RecipeIngredientPreview = {
  unitId: string
  label: string
  count: number
  owned: boolean
}

export type RecipePreview = {
  id: string
  name: string
  tier: string
  ingredients: RecipeIngredientPreview[]
}

export type TowerTypeDef = { id: BaseTowerId; name: string; subtitle: string; color: string; accent: string; description: string }
