import { createGameHost } from './combat/engine'
import type { GameConnection } from './combat/connection'

type Listener = (value: string) => void

let messageListener: Listener | undefined

const connection: GameConnection = {
  OPEN: 1,
  readyState: 1,
  send(value: string) {
    postMessage({ type: 'message', value: JSON.parse(value) })
  },
  on(event, listener) {
    if (event === 'message') messageListener = listener
  },
}

// Both transports run the same rules at 20 Hz, off the browser render thread.
createGameHost().connect(connection, 'local-offline')

self.onmessage = (event: MessageEvent<unknown>) => {
  messageListener?.(JSON.stringify(event.data))
}
