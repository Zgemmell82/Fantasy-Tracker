// Tiny WebSocket relay that rides on the Vite dev/preview server (path: /relay).
// Every client registers a role (host | tv | phone) and a room. Messages are
// forwarded to everyone else in the room; an optional `to` role narrows delivery.
// Also serves GET /__info so the host page can show LAN URLs for phones.
import { WebSocketServer } from 'ws';
import os from 'node:os';

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

function attach(server, httpServer) {
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map(); // room -> Set<{ws, role}>

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/relay') return; // leave Vite HMR alone
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client = { ws, role: url.searchParams.get('role') || 'phone' };
      const room = url.searchParams.get('room') || 'main';
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(client);
      ws.on('message', (data, isBinary) => {
        const text = isBinary ? data : data.toString();
        let env;
        try { env = JSON.parse(text); } catch { return; }
        const payload = JSON.stringify({ from: client.role, m: env.m });
        for (const peer of rooms.get(room)) {
          if (peer === client || peer.ws.readyState !== 1) continue;
          if (env.to && peer.role !== env.to) continue;
          peer.ws.send(payload);
        }
      });
      ws.on('close', () => rooms.get(room)?.delete(client));
    });
  });

  server.middlewares.use('/__info', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ addresses: lanAddresses(), port: httpServer.address()?.port }));
  });
}

export default function relayPlugin() {
  return {
    name: 'survivor-relay',
    configureServer(server) { attach(server, server.httpServer); },
    configurePreviewServer(server) { attach(server, server.httpServer); },
  };
}
