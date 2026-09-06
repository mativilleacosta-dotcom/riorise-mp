const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { /* defaults */ });

const PORT = process.env.PORT || 3000;

// Serve client static files
app.use(express.static(path.join(__dirname, '..', 'client')));

// Game state
const TICK_RATE = 20; // Hz
const TICK_DT = 1 / TICK_RATE;
const PLAYER_SPEED = 160; // px per second

const MAX_HEALTH = 100;
const SELF_HEAL_AMOUNT = 25;
const SELF_HEAL_COOLDOWN = 10 * 1000; // ms
const ALLY_HEAL_AMOUNT = 20;
const ALLY_HEAL_COOLDOWN = 12 * 1000; // ms
const ALLY_HEAL_RANGE = 80; // px
const RESPAWN_TIME = 4 * 1000; // ms

let players = new Map();
let nextFaction = 0; // alternate assignment

function now() { return Date.now(); }

function spawnForFaction(faction) {
  if (faction === 'Red') return { x: 100, y: 200 };
  return { x: 700, y: 200 };
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx*dx + dy*dy);
}

io.on('connection', (socket) => {
  console.log('connect', socket.id);
  const faction = (nextFaction++ % 2 === 0) ? 'Red' : 'Blue';
  const spawn = spawnForFaction(faction);
  const player = {
    id: socket.id,
    name: `Player_${socket.id.slice(0,4)}`,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    input: { up: false, down: false, left: false, right: false },
    health: MAX_HEALTH,
    maxHealth: MAX_HEALTH,
    faction,
    isAlive: true,
    cooldowns: {},
    lastDamagedAt: 0,
    respawnAt: 0
  };
  players.set(socket.id, player);

  socket.emit('welcome', { id: socket.id, players: Array.from(players.values()) });
  socket.broadcast.emit('player_joined', player);

  socket.on('input', (input) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.input = input;
  });

  socket.on('action', (action) => {
    const p = players.get(socket.id);
    if (!p || !p.isAlive) return;
    const nowT = now();
    if (action.type === 'heal') {
      // self heal
      if (!action.targetId) {
        const cd = p.cooldowns.selfHeal || 0;
        if (nowT < cd) return; // still cooldown
        p.health = Math.min(p.maxHealth, p.health + SELF_HEAL_AMOUNT);
        p.cooldowns.selfHeal = nowT + SELF_HEAL_COOLDOWN;
        io.emit('heal_applied', { sourceId: p.id, targetId: p.id, amount: SELF_HEAL_AMOUNT });
      } else {
        // ally heal
        const cd = p.cooldowns.allyHeal || 0;
        if (nowT < cd) return;
        const target = players.get(action.targetId);
        if (!target || target.faction !== p.faction) return;
        if (distance(p, target) > ALLY_HEAL_RANGE) return;
        // apply
        target.health = Math.min(target.maxHealth, target.health + ALLY_HEAL_AMOUNT);
        p.cooldowns.allyHeal = nowT + ALLY_HEAL_COOLDOWN;
        io.emit('heal_applied', { sourceId: p.id, targetId: target.id, amount: ALLY_HEAL_AMOUNT });
      }
    }
  });

  socket.on('chat', (msg) => {
    io.emit('chat', { from: socket.id, text: msg });
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    players.delete(socket.id);
    io.emit('player_left', { id: socket.id });
  });
});

// Game loop: update physics (server-authoritative movement) and handle respawns
setInterval(() => {
  const nowT = now();
  // Update movement
  for (const p of players.values()) {
    if (!p.isAlive) {
      if (p.respawnAt && nowT >= p.respawnAt) {
        // respawn
        const spawn = spawnForFaction(p.faction);
        p.x = spawn.x; p.y = spawn.y; p.health = p.maxHealth; p.isAlive = true; p.respawnAt = 0;
        io.emit('player_respawn', { id: p.id, x: p.x, y: p.y });
      }
      continue;
    }
    const input = p.input || {};
    let dx = 0, dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    // normalize
    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx*dx + dy*dy);
      dx /= len; dy /= len;
    }
    const speed = PLAYER_SPEED * TICK_DT;
    p.x += dx * speed;
    p.y += dy * speed;

    // clamp to play area (simple)
    p.x = Math.max(16, Math.min(784, p.x));
    p.y = Math.max(16, Math.min(384, p.y));
  }

  // Broadcast state snapshot
  const snapshot = Array.from(players.values()).map(p => ({ id: p.id, x: p.x, y: p.y, health: p.health, faction: p.faction, isAlive: p.isAlive }));
  io.emit('state', { players: snapshot, t: nowT });
}, 1000 / TICK_RATE);

// Simple damage example (for testing): if players overlap and different factions, apply small damage
setInterval(() => {
  for (const a of players.values()) {
    if (!a.isAlive) continue;
    for (const b of players.values()) {
      if (a.id === b.id) continue;
      if (!b.isAlive) continue;
      if (a.faction === b.faction) continue;
      if (distance(a, b) < 20) {
        // apply damage once per second
        const nowT = now();
        if (!a._lastDamageTick || nowT - a._lastDamageTick > 1000) {
          b.health -= 10;
          a._lastDamageTick = nowT;
          io.emit('damaged', { sourceId: a.id, targetId: b.id, amount: 10 });
          if (b.health <= 0) {
            b.isAlive = false;
            b.respawnAt = nowT + RESPAWN_TIME;
            io.emit('player_died', { id: b.id, by: a.id });
          }
        }
      }
    }
  }
}, 500);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
