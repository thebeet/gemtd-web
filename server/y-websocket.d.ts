declare module 'y-websocket/bin/utils' {
  import type { IncomingMessage } from 'node:http'
  import type { WebSocket } from 'ws'

  export function setupWSConnection(
    connection: WebSocket,
    request: IncomingMessage,
    options?: { gc?: boolean },
  ): void
}
