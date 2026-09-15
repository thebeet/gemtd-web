import type { Cell, CombatEvent } from '../types'
import type { GameConnection } from './connection'

export type TowerInput = {
  key: string
  type: string
  quality?: number
  unitId?: string
  name?: string
  temporary?: boolean
  abilities?: string[]
  mvpStacks?: number
}
export type DamageType = 'physical' | 'magical'
export type DotEffect = {
  kind: 'poison'
  dps: number
  until: number
  towerKey: string
  level: number
  damageType: DamageType
}
export type TowerRuntime = TowerInput & {
  x: number
  z: number
  damage: number
  damageMultiplier: number
  baseIntervalMs: number
  speedAuraBonus: number
  intervalMs: number
  range: number
  nextAttackAt: number
  multiTargetLimit: number
  radianceLevel: number
  radianceDps: number
  hasTrueSight: boolean
  cannotMiss: boolean
  magicPierce: boolean
  disarmedUntil: number
}
export type ReactiveArmorStack = { until: number; bonus: number }
export type Monster = {
  id: number
  name: string
  x: number
  z: number
  hp: number
  maxHp: number
  armor: number
  magicResistancePercent: number
  speed: number
  distance: number
  flying: boolean
  boss: boolean
  abilities: string[]
  evasionPercent: number
  physicalImmune: boolean
  magicImmune: boolean
  invisible: boolean
  disarmAuraRange: number
  untouchable: boolean
  rechargePerSecond: number
  rushUntil: number
  refractionCharges: number
  reactiveStacks: ReactiveArmorStack[]
  krakenAccum: number
  krakenWindowUntil: number
  krakenCleanseThreshold: number
  lastPathSegment: number
  slowExpires: Record<number, number>
  armorBreakUntil: number
  armorBreakLevel: number
  stunUntil: number
  physAmpUntil: number
  physAmpPercent: number
  dots: DotEffect[]
}
export type PendingDotLog = {
  towerKey: string
  monsterId: number
  monsterName: string
  damage: number
  damageType: DamageType
  killed: boolean
  gold?: number
  greedProc?: boolean
  at: number
}
export type Projectile = {
  id: number
  towerKey: string
  targetId: number
  fromX: number
  fromZ: number
  damage: number
  launchAt: number
  impactAt: number
  color: string
  style: 'orb' | 'laser' | 'arrow'
}
export type FxSegment = { fromX: number; fromZ: number; toX: number; toZ: number }
export type FxEvent = {
  id: number
  kind: 'lightning'
  color: string
  segments: FxSegment[]
}
export type TowerMeta = { type: string; quality?: number; unitId?: string; name?: string }
export type TowerCombatStats = { damage: number; kills: number }
export type Room = {
  clients: Set<GameConnection>
  // A room always returns to building after a wave resolves.  "build" is
  // deliberately a server state, so no client can begin a new wave while the
  // previous combat is still being simulated.
  phase: 'build' | 'combat'
  wave: number
  tick: number
  lives: number
  kills: number
  gold: number
  experience: number
  heroLevel: number
  playerCount: number
  towers: TowerInput[]
  combatTowers: TowerRuntime[]
  monsters: Monster[]
  projectiles: Projectile[]
  route: Cell[]
  flyingRoute: Cell[]
  spawned: number
  spawnCount: number
  nextSpawnAt: number
  resetVersion: number
  resetKind: 'none' | 'wave' | 'game' | 'load'
  currentCombatWave: number
  towerMeta: Map<string, TowerMeta>
  lineageParent: Map<string, string>
  waveStats: Map<number, Map<string, TowerCombatStats>>
  combatEvents: CombatEvent[]
  pendingCombatEvents: CombatEvent[]
  combatEventSeq: number
  pendingFxEvents: FxEvent[]
  fxEventSeq: number
  pendingDotLogs: Map<string, PendingDotLog>
  testCombat: boolean
  testSpawnQueue: Array<{ config: TestMonsterConfig; remaining: number }>
  pendingMvpAward?: { key: string; mvpStacks: number; name?: string; wave: number }
  forceBroadcast?: boolean
}

export type TestMonsterConfig = {
  name?: string
  hp?: number
  armor?: number
  magicResistancePercent?: number
  moveSpeed?: number
  flying?: boolean
  boss?: boolean
  abilities?: string[]
  count?: number
}
