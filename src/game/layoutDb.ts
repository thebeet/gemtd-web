import type { SavedMazeLayout } from './layoutTypes'

const DB_NAME = 'gemtd-layouts'
const DB_VERSION = 1
const STORE = 'layouts'
const MAX_LAYOUTS = 40

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('无法打开布局 IndexedDB'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('bySavedAt', 'savedAt')
      }
    }
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('布局 IndexedDB 操作失败'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('布局 IndexedDB 事务失败'))
    tx.onabort = () => reject(tx.error ?? new Error('布局 IndexedDB 事务中止'))
  })
}

export async function listSavedLayouts(): Promise<SavedMazeLayout[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const all = await requestToPromise(tx.objectStore(STORE).getAll() as IDBRequest<SavedMazeLayout[]>)
    await transactionDone(tx)
    return (all ?? []).sort((left, right) => right.savedAt - left.savedAt)
  } finally {
    db.close()
  }
}

export async function putSavedLayout(layout: SavedMazeLayout): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    await requestToPromise(store.put(layout))
    await transactionDone(tx)

    const pruneTx = db.transaction(STORE, 'readwrite')
    const pruneStore = pruneTx.objectStore(STORE)
    const all = await requestToPromise(pruneStore.getAll() as IDBRequest<SavedMazeLayout[]>)
    const obsolete = (all ?? [])
      .sort((left, right) => right.savedAt - left.savedAt)
      .slice(MAX_LAYOUTS)
    for (const entry of obsolete) await requestToPromise(pruneStore.delete(entry.id))
    await transactionDone(pruneTx)
  } finally {
    db.close()
  }
}

export async function deleteSavedLayout(id: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await requestToPromise(tx.objectStore(STORE).delete(id))
    await transactionDone(tx)
  } finally {
    db.close()
  }
}

export function createLayoutId() {
  return `custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}
