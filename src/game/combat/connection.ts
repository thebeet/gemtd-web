/** Minimal transport contract shared by WebSocket and the local Worker. */
export interface GameConnection {
  readonly OPEN: number
  readonly readyState: number
  send(value: string): void
  on(event: 'message', listener: (raw: { toString(): string }) => void): unknown
  on(event: 'close', listener: () => void): unknown
}
