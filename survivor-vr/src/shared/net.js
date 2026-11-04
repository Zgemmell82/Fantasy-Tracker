// Transport: WebSocket relay (served by the Vite plugin) with a BroadcastChannel
// fallback so everything also works between tabs of one browser with no server.
//   const net = connect({ role: 'host', onMessage: (m, from) => {} });
//   net.send(msg)            -> everyone else
//   net.send(msg, 'tv')      -> only clients with role 'tv'
export function connect({ role, room = 'main', onMessage, onStatus = () => {} }) {
  let ws = null, bc = null, mode = 'connecting', closed = false, retry = 0, openTimer = null;

  function useBroadcast() {
    if (bc || typeof BroadcastChannel === 'undefined') return;
    bc = new BroadcastChannel('survivor-' + room);
    bc.onmessage = (e) => {
      const { from, to, m } = e.data || {};
      if (from === role && !to) { /* same-role chatter is ignored below */ }
      if (to && to !== role) return;
      if (from === role) return;
      onMessage(m, from);
    };
    mode = 'broadcast';
    onStatus(mode);
  }

  function open() {
    if (closed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    try { ws = new WebSocket(`${proto}://${location.host}/relay?room=${encodeURIComponent(room)}&role=${role}`); }
    catch { useBroadcast(); return; }
    openTimer = setTimeout(() => { if (ws && ws.readyState !== 1) { ws.close(); useBroadcast(); } }, 2000);
    ws.onopen = () => { clearTimeout(openTimer); retry = 0; mode = 'ws'; if (bc) { bc.close(); bc = null; } onStatus(mode); };
    ws.onmessage = (e) => {
      try { const d = JSON.parse(e.data); onMessage(d.m, d.from); } catch { /* ignore */ }
    };
    ws.onclose = () => {
      clearTimeout(openTimer);
      if (closed) return;
      if (mode === 'ws') { mode = 'connecting'; onStatus('reconnecting'); }
      setTimeout(open, Math.min(4000, 400 * 2 ** retry++));
    };
    ws.onerror = () => {};
  }

  open();

  return {
    get mode() { return mode; },
    send(m, to) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ to, m }));
      else if (bc) bc.postMessage({ from: role, to, m });
    },
    close() { closed = true; ws?.close(); bc?.close(); },
  };
}
