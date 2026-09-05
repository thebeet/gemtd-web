import type { GameSave } from './saveTypes'

const DB_NAME = 'gemtd-saves'
const DB_VERSION = 1
const STORE = 'saves'
const MAX_SAVES = 40

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('无法打开 IndexedDB'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('byRoomSavedAt', ['room', 'savedAt'])
        store.createIndex('byRoomWave', ['room', 'completedWave'], { unique: false })
      }
    }
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 操作失败'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务中止'))
  })
}

export async function listGameSaves(room: string): Promise<GameSave[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const all = await requestToPromise(store.getAll() as IDBRequest<GameSave[]>)
    await transactionDone(tx)
    return all
      .filter((save) => save.room === room)
      .sort((left, right) => right.savedAt - left.savedAt || right.completedWave - left.completedWave)
  } finally {
    db.close()
  }
}

export async function getGameSave(id: string): Promise<GameSave | undefined> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const save = await requestToPromise(tx.objectStore(STORE).get(id) as IDBRequest<GameSave | undefined>)
    await transactionDone(tx)
    return save
  } finally {
    db.close()
  }
}

async function pruneOldSaves(db: IDBDatabase, room: string) {
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const all = await requestToPromise(store.getAll() as IDBRequest<GameSave[]>)
  const roomSaves = all
    .filter((save) => save.room === room)
    .sort((left, right) => right.savedAt - left.savedAt)
  for (const obsolete of roomSaves.slice(MAX_SAVES)) {
    store.delete(obsolete.id)
  }
  await transactionDone(tx)
}

export async function putGameSave(save: GameSave): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(save)
    await transactionDone(tx)
    await pruneOldSaves(db, save.room)
  } finally {
    db.close()
  }
}

export async function deleteGameSave(id: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    await transactionDone(tx)
  } finally {
    db.close()
  }
}

export function createSaveId(room: string, completedWave: number) {
  return `${room}::wave-${completedWave}::${Date.now()}`
}
