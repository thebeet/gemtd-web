import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import towerData from '../src/game/tower.json'
import waveData from '../src/game/waves.json'

test('every tower quality, recipe and wave matches the original simulation', async (t) => {
  let now = 1_750_000_000_000
  let seed = 987654321
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
  // The override is only used to capture a baseline from a saved pre-refactor source.
  const { handleGameConnection } = await import(process.env.GEMTD_BASELINE_ENGINE || '../server/game.ts')
  const hash = createHash('sha256')
  let messages = 0
  class Client extends EventEmitter {
    OPEN = 1
    readyState = 1
    send(raw: string) { hash.update(raw); messages++ }
    command(value: unknown) { this.emit('message', JSON.stringify(value)) }
  }
  const client = new Client()
  handleGameConnection(client as never, { url: '/game-sync?room=sweep', headers: {} } as never)
  const advance = (count: number) => {
    for (let i = 0; i < count; i++) { now += 50; timers.forEach((tick) => tick()) }
  }
  const towers = [
    ...towerData.baseTowers.flatMap((tower) => tower.levels.map((level) => ({ type: tower.id, quality: level.level }))),
    ...towerData.recipes.map((recipe) => ({ type: recipe.id, quality: 1 })),
  ]
  const abilities = [[], ['guai_shanbi'], ['enemy_wumian'], ['enemy_momian'], ['riki_permanent_invisibility'],
    ['guai_jiaoxieguanghuan'], ['enemy_bukeqinfan'], ['enemy_recharge'], ['enemy_high_armor'],
    ['tidehunter_kraken_shell'], ['enemy_zheguang'], ['enemy_shanshuo'], ['runrunrun'], ['shredder_reactive_armor']]
  for (const tower of towers) {
    client.command({ type: 'resetGame' })
    const layout = [{ ...tower, key: '9:18', mvpStacks: 4 }, { type: 'opal', quality: 5, key: '10:18', mvpStacks: 10 }]
    for (let index = 0; index < abilities.length; index++) {
      client.command({ type: 'spawnTestMonster', towers: layout, monster: {
        hp: 8000, count: 1, moveSpeed: 450, armor: index - 5,
        magicResistancePercent: index * 5, flying: index % 2 === 0, boss: index % 3 === 0,
        abilities: abilities[index],
      } })
    }
    advance(500)
    client.command({ type: 'getCombatEvents' })
    client.command({ type: 'getLeaderboard', wave: 'all' })
  }
  for (const wave of waveData.waves) {
    client.command({ type: 'resetGame' })
    const layout = [{ type: 'diamond', quality: 5, key: '9:18' }, { type: 'emerald', quality: 5, key: '10:18' }]
    client.command({ type: 'restoreSave', towers: layout, battle: { wave: wave.wave, lives: 100 }, server: {} })
    client.command({ type: 'startWave', towers: layout })
    advance(400)
    client.command({ type: 'getCombatEvents' })
  }
  const digest = hash.digest('hex')
  console.log(`Sweep baseline: ${digest}; ${towers.length} tower variants, ${waveData.waves.length} waves, ${messages} messages`)
  assert.equal(digest, 'c02543bbaed9b79d489ac159b0cf744e20958457b5a48c874e93019a8986d894')
})
