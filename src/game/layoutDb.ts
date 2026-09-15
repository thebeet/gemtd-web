import type { SavedMazeLayout } from './layoutTypes'
import { openDatabase, requestToPromise, withStore } from './indexedDb'

const STORE = 'layouts'
const MAX_LAYOUTS = 40
const openDb = () => openDatabase('gemtd-layouts', STORE, (store) => {
  store.createIndex('bySavedAt', 'savedAt')
})

export async function listSavedLayouts(): Promise<SavedMazeLayout[]> {
  const all = await withStore(openDb, STORE, 'readonly', (store) =>
    requestToPromise(store.getAll() as IDBRequest<SavedMazeLayout[]>))
  return (all ?? []).sort((left, right) => right.savedAt - left.savedAt)
}

export async function putSavedLayout(layout: SavedMazeLayout): Promise<void> {
  await withStore(openDb, STORE, 'readwrite', (store) => requestToPromise(store.put(layout)))
  await withStore(openDb, STORE, 'readwrite', async (store) => {
    const all = await requestToPromise(store.getAll() as IDBRequest<SavedMazeLayout[]>)
    const obsolete = (all ?? []).sort((left, right) => right.savedAt - left.savedAt).slice(MAX_LAYOUTS)
    for (const entry of obsolete) await requestToPromise(store.delete(entry.id))
  })
}

export async function deleteSavedLayout(id: string): Promise<void> {
  await withStore(openDb, STORE, 'readwrite', (store) => requestToPromise(store.delete(id)))
}

export function createLayoutId() {
  return `custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}
