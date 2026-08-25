/* ============================================================================
   IMMUNE RESPONSE — game server (zero dependencies, Node >= 18)
   ----------------------------------------------------------------------------
   What this server does (and deliberately does not do):

   1. STATIC HOSTING   — serves ./public (index.html, game.js) over HTTP so
                         anyone on the network can open the game in a browser.
   2. WEBSOCKETS       — a minimal RFC6455 implementation (text frames,
                         ping/pong, close). No npm packages required.
   3. SESSION AUTHORITY— implements the lobby contract from Phase 3's
                         `lobbyClassSelect.html` ({squadCode, slots}, onUpdate,
                         toggleReady, setClass) the way Phase 4's
                         sessionAuthority.js specifies: server-authoritative
                         join/leave, duplicate classes ALLOWED (Director
                         decision, Option A), host slot always first, up to 4
                         human seats. Unfilled seats become AI bots when the
                         match starts (host's client simulates them).
   4. RELAY            — once a match starts, one client is the SIM HOST. It
                         runs the whole combat simulation and streams world
                         snapshots; every other client streams input intents.
                         The server just routes messages and never inspects
                         game content. In-run combat authority lives with the
                         host exactly as Phase 4's architecture.md describes
                         ("open technical spike" resolved pragmatically for a
                         co-op game where all players share one win state).

   Run:      node server.js          (then open the printed URL)
   Config:   PORT env var, default 3000.
   ============================================================================ */

'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_HUMANS = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — readable when read aloud
const LOBBY_GRACE_MS = 90 * 1000;      // disconnected lobby seats are held this long
const DEAD_ROOM_MS = 120 * 1000;       // all-human rooms lost mid-match are swept after this

/* ----------------------------------------------------------------- utils */
function makeCode(len = 4) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return s;
}
function sanitizeName(raw) {
  const s = String(raw || '').replace(/[^\w \-']/g, '').trim();
  return (s || 'Cell').slice(0, 14);
}

/* ----------------------------------------------------------- static files */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
function serveFile(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  const abs = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!abs.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(abs, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache', // prototype-grade: always fresh during development
    });
    res.end(data);
  });
}

/* ------------------------------------------------------------ websocket */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function acceptKey(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

/** Encode a text payload as a full WebSocket frame (server->client: unmasked). */
function wsFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

/**
 * A tiny connection wrapper: buffers TCP bytes, extracts complete frames,
 * reassembles continuation fragments, answers pings, detects closes.
 */
class WsConn {
  constructor(socket, onMessage, onClose) {
    this.socket = socket;
    this.onMessage = onMessage;   // (string)
    this.onClose = onClose;       // ()
    this.buf = Buffer.alloc(0);
    this.fragments = [];
    this.fragOp = 0;
    this.closed = false;
    socket.on('data', (d) => this._feed(d));
    socket.on('close', () => this._end());
    socket.on('error', () => this._end());
    // keepalive: application-level pings from clients are answered below;
    // we also send protocol pings to detect dead peers quickly.
    this.pingTimer = setInterval(() => this.ping(), 20000);
  }
  _end() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pingTimer);
    try { this.socket.destroy(); } catch (_) {}
    if (this.onClose) this.onClose();
  }
  _feed(data) {
    this.buf = Buffer.concat([this.buf, data]);
    while (true) {
      const frame = this._tryReadFrame();
      if (!frame) break;
      const { fin, op, payload } = frame;
      if (op === 0x8) { this.close(1000); return; }              // close
      else if (op === 0x9) { this._sendRaw(this._pongFrame(payload)); } // ping -> pong
      else if (op === 0xA) { /* unsolicited pong: ignore */ }
      else if (op === 0x1 || op === 0x2) {
        if (fin) this._deliver(op, payload);
        else { this.fragOp = op; this.fragments = [payload]; }
      } else if (op === 0x0) {
        this.fragments.push(payload);
        if (fin) {
          const whole = Buffer.concat(this.fragments);
          const op0 = this.fragOp; this.fragments = []; this.fragOp = 0;
          this._deliver(op0, whole);
        }
      }
    }
  }
  _tryReadFrame() {
    const b = this.buf;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const op = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (b.length < 4) return null;
      len = b.readUInt16BE(2); off = 4;
    } else if (len === 127) {
      if (b.length < 10) return null;
      const big = b.readBigUInt64BE(2);
      if (big > 32n * 1024n * 1024n) { this.close(1009); return null; } // 32MB sanity cap
      len = Number(big); off = 10;
    }
    let mask = null;
    if (masked) {
      if (b.length < off + 4) return null;
      mask = b.subarray(off, off + 4); off += 4;
    }
    if (b.length < off + len) return null;
    let payload = b.subarray(off, off + len);
    if (mask) {
      payload = Buffer.from(payload); // copy before unmasking
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    this.buf = b.subarray(off + len);
    return { fin, op, payload };
  }
  _pongFrame(payload) {
    const len = payload.length;
    let header;
    if (len < 126) header = Buffer.from([0x8A, len]);
    else { header = Buffer.alloc(4); header[0] = 0x8A; header[1] = 126; header.writeUInt16BE(len, 2); }
    return Buffer.concat([header, payload]);
  }
  _deliver(op, payload) {
    if (this.onMessage) this.onMessage(payload.toString('utf8'));
  }
  _sendRaw(buf) {
    if (this.closed) return;
    try { this.socket.write(buf); } catch (_) { this._end(); }
  }
  send(objOrStr) {
    this._sendRaw(wsFrame(typeof objOrStr === 'string' ? objOrStr : JSON.stringify(objOrStr)));
  }
  ping() { this._sendRaw(Buffer.from([0x89, 0])); }
  close(code = 1000) {
    const b = Buffer.alloc(4);
    b[0] = 0x88; b[1] = 2; b.writeUInt16BE(code, 2);
    this._sendRaw(b);
    this._end();
  }
}

/* ---------------------------------------------------------------- rooms */
/*
  room = {
    code, phase: 'lobby'|'playing'|'ended',
    hostId, nextPid,
    players: Map pid -> { pid, conn|null, name, cls, ready, human, bot }
  }
*/
const rooms = new Map();     // code -> room
const conns = new Map();     // WsConn -> { player, room }

function roomView(room) {
  const slots = [];
  // Host first, then join order. Bots are only materialized at start-time on
  // the host client; the LOBBY shows empty seats explicitly (clearer than
  // pretending bots are already there).
  for (const p of room.players.values()) {
    slots.push({
      pid: p.pid, name: p.name, cls: p.cls, ready: p.ready,
      human: p.human, host: p.pid === room.hostId,
      gone: p.human && !p.conn, // disconnected — seat held for rejoin grace
    });
  }
  return { code: room.code, phase: room.phase, slots };
}
function buildRoster(room) {
  const roster = [];
  for (const p of room.players.values()) {
    roster.push({ pid: p.pid, name: p.name, cls: p.cls || 'tcell', human: true });
  }
  return roster;
}
function broadcastRoom(room) {
  const view = roomView(room);
  for (const p of room.players.values()) {
    if (p.conn && p.human) p.conn.send({ t: 'lobby', you: p.pid, room: view });
  }
}
function sendErr(conn, msg, fatal) { conn.send({ t: 'err', msg, fatal: !!fatal }); }

function getOrCreateRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { code, phase: 'lobby', hostId: null, nextPid: 1, players: new Map() };
    rooms.set(code, room);
  }
  return room;
}
function maybeDeleteRoom(room) {
  const anyHuman = [...room.players.values()].some(p => p.human && p.conn);
  if (!anyHuman && room.phase !== 'playing') rooms.delete(room.code);
}

function handleCreate(conn, msg) {
  let code;
  do { code = makeCode(4); } while (rooms.has(code));
  const room = getOrCreateRoom(code);
  addPlayer(conn, room, msg);
}
function handleJoin(conn, msg) {
  const code = String(msg.code || '').toUpperCase().trim();
  const room = rooms.get(code);
  if (!room) { sendErr(conn, 'No squad found with code ' + code); return; }
  if (room.phase !== 'lobby') { sendErr(conn, 'That squad already deployed. Use Rejoin from the main menu.'); return; }
  const humans = [...room.players.values()].filter(p => p.human).length;
  if (humans >= MAX_HUMANS) { sendErr(conn, 'Squad is full (4/4).'); return; }
  addPlayer(conn, room, msg);
}
function addPlayer(conn, room, msg) {
  const pid = room.nextPid++;
  const player = {
    pid, conn, room,
    name: sanitizeName(msg.name),
    cls: null, ready: false,
    human: true,
  };
  if (room.hostId === null) room.hostId = pid;
  room.players.set(pid, player);
  conns.set(conn, player);
  conn.send({ t: 'welcome', pid, name: player.name });
  broadcastRoom(room);
}
function handleRejoin(conn, msg) {
  const code = String(msg.code || '').toUpperCase().trim();
  const pid = Number(msg.pid);
  const room = rooms.get(code);
  if (!room) { sendErr(conn, 'That squad no longer exists.', true); return; }
  const player = room.players.get(pid);
  if (!player || !player.human) { sendErr(conn, 'Your seat in that squad is gone.', true); return; }
  if (player.conn) { // stale socket from the previous session — evict quietly
    const old = player.conn;
    conns.delete(old);       // detach first so dropConn is a no-op
    old.close(1000);
  }
  // If they were kicked while away, the seat would have been deleted — the
  // lookup above already covers that.
  player.conn = conn;
  player.disconnectedAt = null;
  conns.set(conn, player);
  console.log(`rejoin: ${player.name}#${player.pid} room ${room.code} (${room.phase})`);
  conn.send({ t: 'welcome', pid: player.pid, name: player.name, rejoined: true });
  if (room.phase === 'lobby') {
    broadcastRoom(room);
  } else {
    const resume = { t: 'resume', code: room.code, roster: buildRoster(room), hostPid: room.hostId, phase: room.phase };
    if (room.phase === 'ended' && room.lastOver) resume.over = room.lastOver;
    conn.send(resume);
    broadcastAll(room, { t: 'peerBack', pid: player.pid, name: player.name });
  }
}
function dropConn(conn) {
  const rec = conns.get(conn);
  if (!rec) return;
  conns.delete(conn);
  const player = rec;        // same shape as onMessage: rec IS the player
  const room = rec.room;
  console.log(`drop: ${player.name}#${player.pid} room ${room.code} (${room.phase})`);

  if (room.phase === 'lobby') {
    // HOLD the seat for a grace window — a wifi blip or accidental close
    // shouldn't cost you your slot. The sweeper removes truly-gone seats.
    player.conn = null;
    player.disconnectedAt = Date.now();
    if (room.hostId === player.pid) {
      const nextHost = [...room.players.values()].find(p => p.human && p.conn);
      if (nextHost) room.hostId = nextHost.pid;
    }
    const anyConnected = [...room.players.values()].some(p => p.human && p.conn);
    // If nobody's connected, hold the room anyway until the grace sweeper
    // lapses — everyone may be mid-blip and about to rejoin.
    if (anyConnected) broadcastRoom(room);
    return;
  }

  // Mid-match disconnect: convert their seat to an AI bot so the run
  // continues — but keep the seat registered so a timely REJOIN hands
  // control straight back (the client flips the entity back to human).
  // Everyone hears about it — INCLUDING the sim host, which is what flips
  // the abandoned seat to AI control.
  player.conn = null;
  player.disconnectedAt = Date.now();
  broadcastAll(room, { t: 'peerLeft', pid: player.pid, name: player.name });

  if (room.hostId === player.pid) migrateHost(room);
}
function migrateHost(room) {
  const candidates = [...room.players.values()].filter(p => p.human && p.conn);
  if (candidates.length === 0) {
    room.phase = 'ended';
    broadcastToGuests(room, { t: 'over', won: false, stats: { wavesCleared: 0 }, reason: 'Squad link lost.' });
    rooms.delete(room.code);
    return;
  }
  const newHost = candidates[0];
  room.hostId = newHost.pid;
  console.log(`host migrated: ${newHost.name}#${newHost.pid} room ${room.code}`);
  newHost.conn.send({ t: 'youHost' });
  broadcastToGuests(room, { t: 'hostMigrated', pid: newHost.pid, name: newHost.name }, newHost.pid);
}
function broadcastToGuests(room, msg, exceptPid = null) {
  for (const p of room.players.values()) {
    if (p.human && p.conn && p.pid !== room.hostId && p.pid !== exceptPid) p.conn.send(msg);
  }
}
function broadcastAll(room, msg) {
  for (const p of room.players.values()) {
    if (p.human && p.conn) p.conn.send(msg);
  }
}

/* Grace sweeper: reaps lobby seats whose players never came back, ends
   all-lost matches, and deletes dead rooms so codes can be reused. */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    const humans = [...room.players.values()].filter(p => p.human);
    if (room.phase === 'playing') {
      // Everyone dropped mid-match and stayed gone: end it so the code frees up.
      const connected = humans.filter(p => p.conn);
      if (humans.length > 0 && connected.length === 0 &&
          humans.every(p => now - (p.disconnectedAt || 0) > DEAD_ROOM_MS)) {
        console.log(`sweep: ending abandoned match ${room.code}`);
        rooms.delete(room.code);
      }
      continue;
    }
    let changed = false;
    for (const p of humans) {
      if (!p.conn && p.disconnectedAt && now - p.disconnectedAt > LOBBY_GRACE_MS) {
        room.players.delete(p.pid);
        changed = true;
      }
    }
    if (changed) {
      if (![...room.players.values()].some(p => p.human && p.conn)) {
        rooms.delete(room.code);
        continue;
      }
      if (room.hostId === null || !(room.players.get(room.hostId) || { conn: null }).conn) {
        const nh = [...room.players.values()].find(p => p.human && p.conn);
        room.hostId = nh ? nh.pid : null;
      }
      broadcastRoom(room);
    } else if (room.phase !== 'lobby') {
      // ended rooms with nobody connected eventually go too
      const anyConnected = [...room.players.values()].some(p => p.human && p.conn);
      const lastActivity = Math.max(0, ...humans.map(p => p.disconnectedAt || 0));
      if (!anyConnected && now - lastActivity > LOBBY_GRACE_MS) rooms.delete(room.code);
    }
  }
}, 15000);
sweeper.unref();

function onMessage(conn, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch (_) { return; }
  if (!msg || typeof msg.t !== 'string') return;
  const rec = conns.get(conn);

  switch (msg.t) {
    case 'hi': break; // name arrives with create/join
    case 'create': if (!rec) handleCreate(conn, msg); return;
    case 'join': if (!rec) handleJoin(conn, msg); return;
    case 'rejoin': if (!rec) handleRejoin(conn, msg); return;
    case 'leave': conn.close(1000); return;
    default: break;
  }

  if (!rec) return;
  const player = rec;        // conns maps conn -> player (player.room is the room)
  const room = player.room;

  switch (msg.t) {
    case 'class':
      if (room.phase === 'lobby') { player.cls = String(msg.k || ''); broadcastRoom(room); }
      break;
    case 'ready':
      if (room.phase === 'lobby') { player.ready = !player.ready; broadcastRoom(room); }
      break;
    case 'startGame': {
      if (player.pid !== room.hostId || room.phase !== 'lobby') break;
      // Every seat must have picked a class (defaults applied client-side too).
      for (const p of room.players.values()) { if (!p.cls) p.cls = 'tcell'; }
      room.phase = 'playing';
      broadcastAll(room, { t: 'started', roster: buildRoster(room), hostPid: room.hostId });
      break;
    }
    case 'kick': {
      if (room.phase !== 'lobby' || player.pid !== room.hostId) break;
      const target = room.players.get(Number(msg.pid));
      if (!target || !target.human || target.pid === player.pid) break;
      console.log(`kick: ${target.name}#${target.pid} from ${room.code}`);
      if (target.conn) {
        conns.delete(target.conn);
        target.conn.send({ t: 'kicked' });
        target.conn.close(1000);
      }
      room.players.delete(target.pid);
      broadcastRoom(room);
      break;
    }
    case 'i': // guest input intent -> host
      if (room.hostId !== player.pid && player.conn) {
        const host = room.players.get(room.hostId);
        if (host && host.conn) host.conn.send({ t: 'pi', pid: player.pid, mx: msg.mx | 0, my: msg.my | 0, f: msg.f | 0, a: msg.a | 0 });
      }
      break;
    case 'g': // guest draft action -> host (vote/confirm/perk/evo)
      if (room.hostId !== player.pid && player.conn) {
        const host = room.players.get(room.hostId);
        if (host && host.conn) host.conn.send({ t: 'gh', pid: player.pid, d: msg.d || {} });
      }
      break;
    case 'toLobby': // anyone can bring an ended/running squad back to the lobby
      if (room.phase === 'playing' || room.phase === 'ended') {
        room.phase = 'lobby';
        for (const p of room.players.values()) p.ready = false;
        broadcastRoom(room);
      }
      break;
    case 'snap': // host snapshot -> guests
      if (player.pid === room.hostId) broadcastToGuests(room, { t: 'snap', d: msg.d });
      break;
    case 'over': { // host announces end-of-run results
      if (player.pid === room.hostId) {
        room.phase = 'ended';
        room.lastOver = { won: !!msg.won, stats: msg.stats || {}, reason: msg.reason || '' };
        broadcastToGuests(room, { t: 'over', ...room.lastOver });
      }
      break;
    }
    default: break;
  }
}

/* ---------------------------------------------------------------- boot */
const server = http.createServer((req, res) => serveFile(req, res, req.url));

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.destroy(); return;
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n` +
    '\r\n'
  );
  const conn = new WsConn(
    socket,
    (str) => { try { onMessage(conn, str); } catch (e) { console.error('msg error:', e); } },
    () => { try { dropConn(conn); } catch (e) { console.error('drop error:', e); } }
  );
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = [];
  try {
    const os = require('os');
    for (const ifs of Object.values(os.networkInterfaces())) {
      for (const i of ifs) if (i.family === 'IPv4' && !i.internal) nets.push(i.address);
    }
  } catch (_) {}
  console.log('');
  console.log('  IMMUNE RESPONSE — squad server online');
  console.log('  -------------------------------------');
  console.log(`  This machine :  http://localhost:${PORT}`);
  for (const ip of nets.slice(0, 3)) console.log(`  Your network :  http://${ip}:${PORT}   <- friends on the same Wi-Fi use this`);
  console.log('');
  console.log('  Solo play works fine from a single browser tab.');
  console.log('  Multiplayer: one player creates a squad and shares the 4-letter code.');
  console.log('');
});

/* Graceful shutdown for platform redeploys (SIGTERM): close every client
   cleanly so browsers bounce to the menu instead of hanging on dead sockets. */
function shutdown() {
  console.log('shutting down');
  for (const conn of conns.keys()) { try { conn.close(1001); } catch (_) {} }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
