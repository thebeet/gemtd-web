/** Shared IndexedDB plumbing. Store names, versions and indexes belong to each repository. */
export function openDatabase(name: string, storeName: string, initialize: (store: IDBObjectStore) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onerror = () => reject(request.error ?? new Error('无法打开 IndexedDB'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) {
        initialize(db.createObjectStore(storeName, { keyPath: 'id' }))
      }
    }
  })
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 操作失败'))
  })
}

/** Install transaction listeners before requests run, and always close the connection. */
export async function withStore<T>(
  open: () => Promise<IDBDatabase>,
  name: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => T | Promise<T>,
): Promise<T> {
  const db = await open()
  try {
    const tx = db.transaction(name, mode)
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务中止'))
    })
    // A request and its transaction can both fail; observe both rejections.
    const result = Promise.resolve().then(() => operation(tx.objectStore(name)))
    const [value] = await Promise.all([result, done])
    return value
  } finally {
    db.close()
  }
}
