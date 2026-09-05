/** WebSocket host for Yjs / combat sync. Production uses same origin (Docker single port). */
export function websocketHost() {
  if (import.meta.env.VITE_WS_HOST) return import.meta.env.VITE_WS_HOST
  if (import.meta.env.PROD) return location.host
  return `${location.hostname || 'localhost'}:1234`
}

export function websocketProtocol() {
  return location.protocol === 'https:' ? 'wss' : 'ws'
}
