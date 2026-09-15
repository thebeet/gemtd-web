import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'
import WebSocket from 'ws'

// Real Chromium + IndexedDB + WebGL + Worker; all data lives in a disposable profile.
const profile = await mkdtemp(join(tmpdir(), 'gemtd-browser-test-'))
const gamePort = 15134
process.env.VITE_GAME_URL = `ws://127.0.0.1:${gamePort}/game-sync`
process.env.VITE_YJS_URL = `ws://127.0.0.1:${gamePort}`
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } })
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(gamePort), SERVE_STATIC: '0' }, stdio: 'pipe',
})
let serverOutput = ''
server.stderr.on('data', (chunk) => { serverOutput += chunk })
const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })
let socket: WebSocket | undefined
let chromeOutput = ''
chrome.stderr.on('data', (chunk) => { chromeOutput += chunk })

async function until<T>(check: () => Promise<T> | T, description: string, timeout = 20000): Promise<T> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await check()
    if (result) return result
    await delay(100)
  }
  throw new Error(`Timed out: ${description}\n${serverOutput}\n${chromeOutput.slice(-1500)}`)
}

try {
  await vite.listen()
  const url = vite.resolvedUrls!.local[0]
  await until(async () => {
    try { return (await fetch(`http://127.0.0.1:${gamePort}`)).ok } catch { return false }
  }, 'WebSocket server')
  const endpoint = await until(() => chromeOutput.match(/DevTools listening on (ws:\/\/\S+)/)?.[1], 'Chromium')
  socket = new WebSocket(endpoint)
  await once(socket, 'open')
  let nextId = 0
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()
  const exceptions: string[] = []
  const connections: string[] = []
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString())
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(JSON.stringify(message.params.exceptionDetails))
    if (message.method === 'Network.webSocketCreated') connections.push(message.params.url)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })
  async function cdp(method: string, params: object = {}, sessionId?: string): Promise<any> {
    const id = ++nextId
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 30000)
      pending.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolve(value) },
        reject: (error) => { clearTimeout(timeout); reject(error) },
      })
    })
    socket!.send(JSON.stringify({ id, method, params, sessionId }))
    return response
  }
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  await cdp('Runtime.enable', {}, sessionId)
  await cdp('Page.enable', {}, sessionId)
  await cdp('Network.enable', {}, sessionId)
  async function evaluate(expression: string): Promise<any> {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const state = `document.querySelector('#app').__vue_app__._instance.setupState`
  const optionalState = `document.querySelector('#app')?.__vue_app__?._instance?.setupState`
  await cdp('Page.navigate', { url: `${url}game` }, sessionId)
  await until(() => evaluate(`Boolean(${optionalState}?.battleConnected && document.querySelector('canvas'))`), 'offline scene and Worker')
  // Vite's HMR socket is expected in development; game sockets are not.
  assert.equal(connections.filter((value) => value.includes(String(gamePort))).length, 0)
  assert.ok(await evaluate(`${state}.routeLength > 0`))
  for (const [flag, selector] of [
    ['showLeaderboard', '.damage-leaderboard-panel'],
    ['showCombatEvents', '.battle-events-panel'],
    ['showSaves', '.game-saves-panel'],
    ['showTestMonster', '.test-monster-panel'],
    ['showLayouts', '.maze-layout-panel'],
  ]) {
    await evaluate(`${state}.${flag} = true`)
    await until(() => evaluate(`Boolean(document.querySelector('${selector}'))`), selector)
    await evaluate(`document.querySelector('${selector} .detail-close').click()`)
    await until(() => evaluate(`!document.querySelector('${selector}')`), `close ${selector}`)
  }
  await evaluate(`(async () => {
    const app = ${state}
    app.beginBuildRound()
    for (let i = 0; i < 5; i++) app.placeRandomTower((10 + i) + ':18')
    app.selectTower('10:18')
    await import('/node_modules/.vite/deps/vue.js').then(m => m.nextTick())
    app.chooseKeepOption(app.selectedKeepOptions[0])
    app.startCombat()
  })()`)
  await until(() => evaluate(`${state}.battleState.phase === 'combat' && ${state}.battleState.monsters.length > 0`), 'offline combat')
  await evaluate(`${state}.resetCurrentWave()`)
  await until(() => evaluate(`${state}.battleState.phase === 'build'`), 'offline reset')

  const storage = await evaluate(`(async () => {
    const saves = await import('/src/game/saveDb.ts')
    const layouts = await import('/src/game/layoutDb.ts')
    const battle = { wave: 2, lives: 100, kills: 10, gold: 10, experience: 50, heroLevel: 1 }
    const save = { id: 'legacy-save', savedAt: 1, label: 'legacy', room: 'test', playerId: 'test', completedWave: 1,
      towers: {}, playerStates: {}, buildState: { wave: 2, playerLevel: 1, phase: 'idle', pendingKeys: [] },
      battle, server: { towerMeta: [], lineageParent: [], waveStats: [] } }
    // Create a v1 record directly, before opening the refactored repository.
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('gemtd-saves', 1)
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore('saves', { keyPath: 'id' })
        store.createIndex('byRoomSavedAt', ['room', 'savedAt'])
        store.createIndex('byRoomWave', ['room', 'completedWave'], { unique: false })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite'); tx.objectStore('saves').put(save)
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error)
    })
    db.close()
    const legacy = await saves.getGameSave('legacy-save')
    await saves.putGameSave({ ...save, id: 'other-room', room: 'other' })
    for (let i = 0; i < 42; i++) await saves.putGameSave({ ...save, id: 'save-' + i, savedAt: 100 + i })
    for (let i = 0; i < 42; i++) await layouts.putSavedLayout({ id: 'layout-' + i, savedAt: i, name: 'layout', summary: '', pathLen: 0, cells: ['10:10'] })
    const saved = await saves.listGameSaves('test'), layoutList = await layouts.listSavedLayouts()
    await saves.deleteGameSave(saved[0].id)
    await layouts.deleteSavedLayout(layoutList[0].id)
    let rejected = false
    try { await saves.putGameSave({ ...save, id: undefined }) } catch { rejected = true }
    return { legacy: legacy.label, saves: saved.length, newest: saved[0].id,
      other: (await saves.listGameSaves('other')).length, layouts: layoutList.length,
      remainingSaves: (await saves.listGameSaves('test')).length,
      remainingLayouts: (await layouts.listSavedLayouts()).length, rejected }
  })()`)
  assert.deepEqual(storage, { legacy: 'legacy', saves: 40, newest: 'save-41', other: 1, layouts: 40, remainingSaves: 39, remainingLayouts: 39, rejected: true })

  // Mobile layout uses the same controls, and camera changes retain the scene.
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId)
  await evaluate(`${state}.toggleCameraView()`)
  assert.ok(await evaluate(`document.querySelector('canvas').width > 0`))
  await cdp('Page.navigate', { url: `${url}game?room=browser-regression` }, sessionId)
  await until(() => evaluate(`Boolean(${optionalState}?.battleConnected && ${optionalState}?.connected)`), 'online Yjs and battle connections')
  assert.ok(connections.some((value) => value.includes('/game-sync?room=browser-regression')))
  assert.ok(connections.some((value) => value.includes('/browser-regression')))
  assert.deepEqual(exceptions, [])
  console.log('Browser checks passed: offline Worker combat/reset, five panels, mobile camera, v1 IndexedDB compatibility/pruning/errors, online Yjs and battle sockets.')
} finally {
  socket?.close()
  const chromeExit = once(chrome, 'exit').catch(() => {})
  chrome.kill('SIGTERM')
  server.kill('SIGTERM')
  await vite.close()
  await Promise.race([chromeExit, delay(3000)])
  await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}
