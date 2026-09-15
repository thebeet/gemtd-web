import type { IncomingMessage } from 'node:http'
import type { WebSocket } from 'ws'
import { createGameHost } from '../src/game/combat/engine'

const host = createGameHost()

export function handleGameConnection(connection: WebSocket, request: IncomingMessage) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const roomId = (url.searchParams.get('room') || 'defense').slice(0, 80)
  host.connect(connection, roomId)
}
