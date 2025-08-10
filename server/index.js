
import express from 'express';
import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import path from 'path';
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Basic health check for Render
app.get('/health', (req, res) => res.status(200).send('ok'));

// Serve static client
app.use(express.static(path.join(__dirname, '../client')));

const server = app.listen(PORT, () => {
  console.log(`HTTP listening on http://localhost:${PORT}`);
});

// WebSocket
const wss = new WebSocketServer({ server });

// --- Game state ---
const COLORS = ['red', 'green', 'yellow', 'blue'];
const COLOR_OFFSET = { red: 0, green: 13, yellow: 26, blue: 39 }; // starting tile offsets on 0..51 ring
const SAFE_ABS = [0, 8, 13, 21, 26, 34, 39, 47]; // absolute safe tiles on main ring

// Room map: code -> { players: Map<id, {...}>, order: [id], state: {...}, started: bool, hostId }
const rooms = new Map();

function send(ws, type, payload) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function broadcast(room, payload) {
  for (const p of room.players.values()) {
    if (p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(payload));
    }
  }
}

function genCode() { 
  return nanoid(6).toUpperCase(); 
}

function makeInitialPlayerState() {
  // 4 pieces at base: -1, home range 52..57, finished 58
  return { pieces: [-1, -1, -1, -1], sixStreak: 0, finished: 0 };
}

function buildInitialRoom() {
  return {
    players: new Map(),
    order: [],
    state: { turn: null, dice: null, log: [], turnIndex: 0 },
    started: false,
    hostId: null
  };
}

function absoluteIndex(color, rel) {
  if (rel < 0 || rel > 51) return null; // only for main ring
  return (COLOR_OFFSET[color] + rel) % 52;
}

function canMovePiece(relPos, roll) {
  // relPos: -1 base, 0..51 ring, 52..57 home
  if (relPos === -1) return roll === 6; // need 6 to exit
  if (relPos >= 0 && relPos <= 51) {
    const next = relPos + roll;
    return next <= 57; // allows entering home stretch after 51
  }
  if (relPos >= 52 && relPos <= 57) {
    return relPos + roll <= 57; // cannot overshoot home
  }
  return false;
}

function movePiece(color, relPos, roll) {
  if (relPos === -1) return 0; // onto start on 6
  const next = relPos + roll;
  if (relPos <= 51 && next <= 51) return next; // still on ring
  if (relPos <= 51 && next > 51) return Math.min(57, next); // entering home stretch
  if (relPos >= 52 && relPos <= 57) return Math.min(57, relPos + roll);
  return relPos;
}

function isSafeTileAbs(absIdx) { 
  return SAFE_ABS.includes(absIdx); 
}

function allPiecesFinished(p) { 
  return p.pieces.every(v => v === 58); 
}

function computeCaptures(room, moverId, color, pieceIndex, newRel) {
  // capture only on main ring, not in home stretch and not on safe tiles
  if (!(newRel >= 0 && newRel <= 51)) return; 
  const abs = absoluteIndex(color, newRel);
  if (isSafeTileAbs(abs)) return;
  
  for (const [pid, op] of room.players.entries()) {
    if (pid === moverId) continue;
    const ocolor = op.color;
    for (let i = 0; i < 4; i++) {
      const r = op.state.pieces[i];
      if (r >= 0 && r <= 51) {
        const oabs = absoluteIndex(ocolor, r);
        if (oabs === abs) {
          op.state.pieces[i] = -1; // send to base
          room.state.log.push(`${op.name}'s piece captured by ${room.players.get(moverId).name}`);
        }
      }
    }
  }
}

function nextTurn(room, rolledSix, currentId) {
  if (rolledSix) {
    room.state.log.push(`${room.players.get(currentId).name} rolls a six and goes again`);
    return; 
  }
  const n = room.order.length;
  room.state.turnIndex = (room.state.turnIndex + 1) % n;
  room.state.turn = room.order[room.state.turnIndex];
}

function startIfPossible(room) {
  if (!room.started && room.players.size >= 2) {
    room.started = true;
    room.order = Array.from(room.players.keys());
    room.state.turnIndex = 0;
    room.state.turn = room.order[0];
    room.state.log.push('Game started!');
  }
}

// Improved random dice generation
function rollDice() {
  // Use crypto.randomInt for better randomness if available
  if (typeof crypto !== 'undefined' && crypto.randomInt) {
    return crypto.randomInt(1, 7);
  }
  // Fallback to Math.random with better distribution
  return Math.floor(Math.random() * 6) + 1;
}

wss.on('connection', ws => {
  ws.id = nanoid(8);
  ws.roomCode = null;
  
  ws.on('message', msg => {
    let data; 
    try { 
      data = JSON.parse(msg); 
    } catch { 
      return; 
    }

    if (data.type === 'create_room') {
      const code = genCode();
      const room = buildInitialRoom();
      rooms.set(code, room);
      room.hostId = ws.id;
      ws.roomCode = code;
      send(ws, 'room_created', { 
        code, 
        link: `${data.origin}/?room=${code}` 
      });
    }

    if (data.type === 'join_room') {
      const { code, name } = data;
      const room = rooms.get(code);
      
      if (!room) {
        return send(ws, 'error', { message: 'Room not found' });
      }
      
      if (room.players.size >= 4) {
        return send(ws, 'error', { message: 'Room is full (maximum 4 players)' });
      }

      const used = new Set(Array.from(room.players.values()).map(p => p.color));
      const color = COLORS.find(c => !used.has(c));

      room.players.set(ws.id, { 
        id: ws.id, 
        ws, 
        name: name || 'Player', 
        color, 
        state: makeInitialPlayerState() 
      });
      ws.roomCode = code;

      startIfPossible(room);

      broadcast(room, { 
        type: 'room_update', 
        players: Array.from(room.players.values()).map(p => ({ 
          id: p.id, 
          name: p.name, 
          color: p.color 
        })),
        started: room.started, 
        code,
        turn: room.state.turn,
        log: room.state.log,
      });
    }

    if (data.type === 'start_game') {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      
      if (room.players.size < 2) {
        return send(ws, 'error', { message: 'Need at least 2 players to start' });
      }
      
      startIfPossible(room);
      broadcast(room, { 
        type: 'room_update',
        players: Array.from(room.players.values()).map(p => ({ 
          id: p.id, 
          name: p.name, 
          color: p.color 
        })),
        started: room.started, 
        code: ws.roomCode, 
        turn: room.state.turn, 
        log: room.state.log 
      });
    }

    if (data.type === 'roll_dice') {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.started) {
        return send(ws, 'error', { message: 'Game not started' });
      }
      
      if (room.state.turn !== ws.id) {
        return send(ws, 'error', { message: 'Not your turn' });
      }

      const p = room.players.get(ws.id);
      const roll = rollDice(); // Use improved random function
      room.state.dice = roll;

      const movable = [];
      for (let i = 0; i < 4; i++) {
        if (canMovePiece(p.state.pieces[i], roll)) {
          movable.push(i);
        }
      }

      broadcast(room, { type: 'dice', player: ws.id, roll, movable });
      
      if (movable.length === 0) {
        room.state.log.push(`${p.name} rolled ${roll} and cannot move`);
        nextTurn(room, false, ws.id);
        broadcast(room, { type: 'turn', id: room.state.turn });
      }
    }

    if (data.type === 'move_piece') {
      const { pieceIndex } = data;
      const room = rooms.get(ws.roomCode);
      
      if (!room || !room.started) {
        return send(ws, 'error', { message: 'Game not started' });
      }
      
      if (room.state.turn !== ws.id) {
        return send(ws, 'error', { message: 'Not your turn' });
      }
      
      const roll = room.state.dice;
      if (!roll) {
        return send(ws, 'error', { message: 'No dice roll available' });
      }

      const p = room.players.get(ws.id);
      const rel = p.state.pieces[pieceIndex];
      
      if (!canMovePiece(rel, roll)) {
        return send(ws, 'error', { message: 'Invalid move' });
      }
      
      const newRel = movePiece(p.color, rel, roll);
      p.state.pieces[pieceIndex] = newRel;

      computeCaptures(room, ws.id, p.color, pieceIndex, newRel);

      if (allPiecesFinished(p)) {
        room.state.log.push(`${p.name} has won the game!`);
        broadcast(room, { 
          type: 'game_over', 
          winner: { id: p.id, name: p.name, color: p.color } 
        });
        return;
      }

      const rolledSix = roll === 6;
      room.state.dice = null;
      
      broadcast(room, { 
        type: 'state', 
        code: ws.roomCode,
        players: Array.from(room.players.values()).map(pl => ({ 
          id: pl.id, 
          name: pl.name, 
          color: pl.color, 
          pieces: pl.state.pieces 
        })),
        log: room.state.log
      });
      
      nextTurn(room, rolledSix, ws.id);
      broadcast(room, { type: 'turn', id: room.state.turn });
    }
  });

  ws.on('close', () => {
    const code = ws.roomCode;
    if (!code) return;
    
    const room = rooms.get(code);
    if (!room) return;
    
    room.players.delete(ws.id);
    room.order = room.order.filter(id => id !== ws.id);
    
    if (room.order.length === 0) {
      rooms.delete(code);
      return;
    }
    
    if (room.state.turn === ws.id) {
      room.state.turnIndex = room.state.turnIndex % room.order.length;
      room.state.turn = room.order[room.state.turnIndex];
    }
    
    broadcast(room, { 
      type: 'room_update', 
      players: Array.from(room.players.values()).map(p => ({ 
        id: p.id, 
        name: p.name, 
        color: p.color 
      })),
      started: room.started, 
      code, 
      turn: room.state.turn, 
      log: room.state.log 
    });
  });
});
