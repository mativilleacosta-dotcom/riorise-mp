# Riorise MP - Prototype

Top-down multiplayer prototype with factions and heal actions.

How to run (local):

1. Install dependencies and start the server

```bash
cd server
npm install
npm start
```

2. Open the client in your browser
- Open `http://localhost:3000` in 1 or more tabs to simulate multiple players.

Controls
- WASD to move
- "Curar Self" button to heal yourself (25 HP, 10s cooldown)
- "Curar Ally" button to heal nearest allied player in range (20 HP, 12s cooldown)

Notes
- Server is authoritative for movement and health.
- Players are auto-assigned to Red/Blue factions on join.

Next steps
- Add visual cooldown indicators and animations.
- Add authentication/username selection.
- Add vehicles, weapons, and more complex game rules.
