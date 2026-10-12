// viem asks isows for a websocket. a browser has one, so the web try page hands it over directly
export const WebSocket = globalThis.WebSocket
export const getNativeWebSocket = () => globalThis.WebSocket
