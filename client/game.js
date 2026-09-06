// client/game.js - Phaser 3 + socket.io client
(() => {
  const socket = io();
  let myId = null;
  let players = {}; // id -> sprite data

  const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 400,
    parent: 'gameContainer',
    backgroundColor: '#7ec8ff',
    scene: {
      preload,
      create,
      update
    }
  };

  const game = new Phaser.Game(config);
  let cursors;
  let selfHealBtn, allyHealBtn;
  let playerSpriteGroup;

  function preload() {
  }

  function create() {
    const scene = this;
    // simple ground
    const g = scene.add.rectangle(400, 200, 800, 400, 0x7ec8ff);

    playerSpriteGroup = scene.add.group();

    // input
    cursors = scene.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' });

    // UI hooks
    document.getElementById('selfHealBtn').addEventListener('click', () => {
      socket.emit('action', { type: 'heal' });
    });
    document.getElementById('allyHealBtn').addEventListener('click', () => {
      // pick nearest ally
      const me = players[myId];
      if (!me) return;
      let best = null; let bestDist = 99999;
      for (const id in players) {
        if (id === myId) continue;
        const p = players[id];
        if (p.faction !== me.faction) continue;
        const dx = p.x - me.x; const dy = p.y - me.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < bestDist) { bestDist = d; best = id; }
      }
      if (best && bestDist <= 80) {
        socket.emit('action', { type: 'heal', targetId: best });
        log(`Healer: requested heal on ${best}`);
      } else {
        log('No ally in range to heal');
      }
    });

    // network handlers
    socket.on('welcome', (data) => {
      myId = data.id;
      document.getElementById('playerName').textContent = `You: ${myId.slice(0,6)}`;
      // add existing players
      for (const p of data.players) addOrUpdatePlayer(p);
    });

    socket.on('player_joined', (p) => { addOrUpdatePlayer(p); log(`${p.id.slice(0,6)} joined (${p.faction})`); });
    socket.on('player_left', ({id}) => { removePlayer(id); log(`${id.slice(0,6)} left`); });

    socket.on('state', (s) => {
      // reconcile players
      for (const p of s.players) {
        addOrUpdatePlayer(p);
      }
    });

    socket.on('heal_applied', (ev) => {
      const { sourceId, targetId, amount } = ev;
      log(`${sourceId.slice(0,6)} healed ${targetId.slice(0,6)} for ${amount}`);
    });

    socket.on('damaged', (ev) => {
      const { sourceId, targetId, amount } = ev;
      log(`${sourceId.slice(0,6)} damaged ${targetId.slice(0,6)} for ${amount}`);
    });

    socket.on('player_died', (ev) => { log(`${ev.id.slice(0,6)} died (by ${ev.by.slice(0,6)})`); });
    socket.on('player_respawn', (ev) => { log(`${ev.id.slice(0,6)} respawned`); });

    function sendInput() {
      const input = { up: !!cursors.up.isDown, down: !!cursors.down.isDown, left: !!cursors.left.isDown, right: !!cursors.right.isDown };
      socket.emit('input', input);
    }

    // send input 20 times/sec
    setInterval(sendInput, 50);

    // simple update of HUD health
    setInterval(() => {
      const me = players[myId];
      if (!me) return;
      const pct = Math.max(0, Math.min(1, me.health / me.maxHealth));
      document.getElementById('healthInner').style.width = Math.floor(pct*100) + '%';
      document.getElementById('faction').textContent = `Faction: ${me.faction || '-'} `;
    }, 100);
  }

  function update() {
    // render sprites based on players map
    for (const id in players) {
      const p = players[id];
      if (!p.sprite) {
        // create a new graphics object
        const g = this.add.container(p.x, p.y);
        const c = this.add.circle(0, 0, 12, p.faction === 'Red' ? 0xff6b6b : 0x60a5fa);
        const name = this.add.text(-18, -28, id.slice(0,6), { fontSize: '12px', color: '#042' });
        g.add([c, name]);
        p.sprite = g;
      }
      // smooth move
      p.sprite.x = Phaser.Math.Linear(p.sprite.x, p.x, 0.35);
      p.sprite.y = Phaser.Math.Linear(p.sprite.y, p.y, 0.35);
    }
  }

  function addOrUpdatePlayer(p) {
    const existing = players[p.id];
    if (existing) {
      existing.x = p.x; existing.y = p.y; existing.health = p.health; existing.faction = p.faction; existing.maxHealth = p.maxHealth; existing.isAlive = p.isAlive;
    } else {
      players[p.id] = { id: p.id, x: p.x, y: p.y, health: p.health, maxHealth: p.maxHealth, faction: p.faction, isAlive: p.isAlive };
    }
  }

  function removePlayer(id) {
    if (!players[id]) return;
    if (players[id].sprite) players[id].sprite.destroy();
    delete players[id];
  }

  function log(text) {
    const el = document.getElementById('log');
    const d = document.createElement('div'); d.textContent = text; el.prepend(d);
  }
})();
