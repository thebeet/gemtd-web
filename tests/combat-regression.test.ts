import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'

test('combat protocol preserves deterministic battle, save, reset and multiplayer behavior', async (t) => {
  let now = 1_750_000_000_000
  let seed = 123456789
  const timers: Array<() => void> = []
  t.mock.method(Date, 'now', () => now)
  t.mock.method(Math, 'random', () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  })
  t.mock.method(globalThis, 'setInterval', (callback: () => void) => {
    timers.push(callback)
    return { unref() {} }
  })
  const { handleGameConnection } = await import('../server/game.ts')
  const transcript: unknown[] = []
  class Client extends EventEmitter {
    OPEN = 1
    readyState = 1
    messages: any[] = []
    send(raw: string) {
      const message = JSON.parse(raw)
      this.messages.push(message)
      transcript.push(message)
    }
    command(message: unknown) { this.emit('message', JSON.stringify(message)) }
    last(type: string) { return this.messages.findLast((message) => message.type === type) }
  }
  const connect = (room: string) => {
    const client = new Client()
    handleGameConnection(client as never, { url: `/game-sync?room=${room}`, headers: {} } as never)
    return client
  }
  const advance = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      now += 50
      timers.forEach((tick) => tick())
    }
  }
  const client = connect('regression')
  assert.equal(client.last('snapshot').phase, 'build')
  client.emit('message', '{')
  assert.equal(client.last('error').message, '无法识别游戏指令')
  client.command({ type: 'startWave', towers: [] })
  assert.equal(client.last('error').message, '至少需要一座可攻击的塔')
  const towers = [
    { key: '9:18', type: 'ruby', quality: 5 },
    { key: '10:18', type: 'emerald', quality: 5 },
    { key: '11:18', type: 'sapphire', quality: 5 },
    { key: '12:18', type: 'opal', quality: 5 },
    { key: '13:18', type: 'diamond', quality: 5 },
  ]
  client.command({ type: 'syncLayout', towers })
  client.command({ type: 'startWave', towers })
  client.command({ type: 'getSaveState' })
  assert.equal(client.last('error').message, '战斗中无法导出存档')
  for (let i = 0; i < 10000 && client.last('snapshot').phase === 'combat'; i++) advance(1)
  assert.equal(client.last('snapshot').phase, 'build')
  assert.equal(client.last('snapshot').wave, 2)
  assert.ok(client.last('snapshot').kills > 0)
  client.command({ type: 'getSaveState' })
  const save = client.last('saveState')
  client.command({ type: 'getLeaderboard', wave: 'all' })
  assert.ok(client.last('leaderboard').entries.length > 0)
  client.command({ type: 'getCombatEvents' })
  assert.ok(client.last('combatEvents').events.length > 0)
  client.command({ type: 'resetGame' })
  assert.equal(client.last('snapshot').wave, 1)
  client.command({ type: 'restoreSave', battle: save.battle, server: save.server, towers })
  assert.equal(client.last('snapshot').wave, 2)
  const peer = connect('regression')
  assert.equal(peer.last('snapshot').wave, 2)
  client.command({ type: 'spawnTestMonster', towers, monster: { count: 3, hp: 500, flying: true, abilities: ['invisible'] } })
  assert.equal(client.last('snapshot').playerCount, 2)
  advance(120)
  client.command({ type: 'resetWave' })
  assert.equal(client.last('snapshot').resetKind, 'wave')
  client.command({ type: 'registerCombine', resultKey: '9:18', ingredientKeys: ['9:18', '10:18'], result: towers[0] })
  client.command({ type: 'getLeaderboard', wave: 'all' })
  peer.emit('close')
  const isolated = connect('isolated')
  assert.equal(isolated.last('snapshot').wave, 1)
  const digest = createHash('sha256').update(JSON.stringify(transcript)).digest('hex')
  console.log('Combat baseline:', digest, 'messages:', transcript.length)
  // Locked to the pre-refactor implementation after capturing its transcript.
  assert.equal(digest, '98e0a60a8ae13eb10334dde75e55d1c0a3d4d51c84bc657059b96de14a67010a')
})
