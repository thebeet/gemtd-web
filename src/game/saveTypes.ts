import type { PlayerBuildState, Tower } from './types'

export type SavedTowerMeta = {
  type: string
  quality?: number
  unitId?: string
  name?: string
}

export type SavedTowerCombatStats = {
  damage: number
  kills: number
}

export type GameSaveBattle = {
  wave: number
  lives: number
  kills: number
  gold: number
  experience: number
  heroLevel: number
}

export type GameSaveServer = {
  towerMeta: Array<[string, SavedTowerMeta]>
  lineageParent: Array<[string, string]>
  waveStats: Array<[number, Array<[string, SavedTowerCombatStats]>]>
}

export type GameSave = {
  id: string
  savedAt: number
  label: string
  room: string
  playerId: string
  completedWave: number
  towers: Record<string, string>
  playerStates: Record<string, string>
  buildState: PlayerBuildState
  battle: GameSaveBattle
  server: GameSaveServer
}

export type SaveStateMessage = {
  type: 'saveState'
  battle: GameSaveBattle
  server: GameSaveServer
}

export type RestoreSavePayload = {
  type: 'restoreSave'
  battle: GameSaveBattle
  server: GameSaveServer
  towers: Array<Tower & { key: string }>
}
