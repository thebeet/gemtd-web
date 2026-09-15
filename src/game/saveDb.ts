import type { GameSave } from './saveTypes'
import { openDatabase, requestToPromise, withStore } from './indexedDb'

const STORE = 'saves'
const MAX_SAVES = 40
const openDb = () => openDatabase('gemtd-saves', STORE, (store) => {
  store.createIndex('byRoomSavedAt', ['room', 'savedAt'])
  store.createIndex('byRoomWave', ['room', 'completedWave'], { unique: false })
})

export async function listGameSaves(room: string): Promise<GameSave[]> {
  const all = await withStore(openDb, STORE, 'readonly', (store) =>
    requestToPromise(store.getAll() as IDBRequest<GameSave[]>))
  return all.filter((save) => save.room === room)
    .sort((left, right) => right.savedAt - left.savedAt || right.completedWave - left.completedWave)
}

export function getGameSave(id: string): Promise<GameSave | undefined> {
  return withStore(openDb, STORE, 'readonly', (store) =>
    requestToPromise(store.get(id) as IDBRequest<GameSave | undefined>))
}

export async function putGameSave(save: GameSave): Promise<void> {
  await withStore(openDb, STORE, 'readwrite', (store) => { store.put(save) })
  await withStore(openDb, STORE, 'readwrite', async (store) => {
    const all = await requestToPromise(store.getAll() as IDBRequest<GameSave[]>)
    const obsolete = all.filter((entry) => entry.room === save.room)
      .sort((left, right) => right.savedAt - left.savedAt).slice(MAX_SAVES)
    for (const entry of obsolete) store.delete(entry.id)
  })
}

export function deleteGameSave(id: string): Promise<void> {
  return withStore(openDb, STORE, 'readwrite', (store) => { store.delete(id) })
}

export function createSaveId(room: string, completedWave: number) {
  return `${room}::wave-${completedWave}::${Date.now()}`
}
