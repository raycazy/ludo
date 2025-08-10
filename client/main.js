// Simple client using native WebSocket and Canvas rendering
const board = document.getElementById('board');
const ctx = board.getContext('2d');

const createBtn = document.getElementById('create-room');
const joinBtn = document.getElementById('join-room');
const startBtn = document.getElementById('start');
const codeEl = document.getElementById('code');
const playersEl = document.getElementById('players');
const turnEl = document.getElementById('turn');
const rollBtn = document.getElementById('roll');
const diceEl = document.getElementById('dice');
const logEl = document.getElementById('log');
const shareEl = document.getElementById('share');

const nameInput = document.getElementById('player-name');
const codeInput = document.getElementById('room-code');

let ws;
let myId = null;
let myColor = null;
let roomCode = null;
let currentState = { players: [], piecesById: {} };
let movable = [];

const COLORS = ['red','green','yellow','blue'];
const COLOR_RGB = { red:'#e74c3c', green:'#2ecc71', yellow:'#f1c40f', blue:'#3498db' };
const COLOR_OFFSET = { red:0, green:13, yellow:26, blue:39 };
const SAFE_ABS = [0,8,13,21,26,34,39,47];

function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => {
    const urlParams = new URLSearchParams(location.search);
    const codeParam = urlParams.get('room');
    if (codeParam) codeInput.value = codeParam;
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'room_created') {
      roomCode = msg.code; codeEl.textContent = roomCode;
      shareEl.classList.remove('hidden');
      shareEl.textContent = `Share link: ${msg.link}`;
    }
    if (msg.type === 'room_update') {
      roomCode = msg.code; codeEl.textContent = roomCode;
      renderPlayers(msg.players);
      if (msg.started) startBtn.classList.add('hidden'); else startBtn.classList.remove('hidden');
      if (msg.turn) turnEl.textContent = shortId(msg.turn);
      logEl.textContent = msg.log.join('\n');
    }
    if (msg.type === 'dice') {
      diceEl.textContent = `Dice: ${msg.roll}`;
      movable = msg.movable;
      if (!myId) myId = msg.player;
      rollBtn.disabled = true;
    }
    if (msg.type === 'state') {
      updatePieces(msg.players);
      logEl.textContent = msg.log.join('\n');
      drawBoard();
    }
    if (msg.type === 'turn') {
      turnEl.textContent = shortId(msg.id);
      rollBtn.disabled = msg.id !== myId;
      diceEl.textContent = '';
      movable = [];
    }
    if (msg.type === 'game_over') {
      alert(`Winner: ${msg.winner.name}`);
      rollBtn.disabled = true;
    }
    if (msg.type === 'error') {
      alert(msg.message);
    }
  };
}

connect();

createBtn.onclick = () => {
  const origin = location.origin;
  ws.send(JSON.stringify({ type: 'create_room', origin }));
};

joinBtn.onclick = () => {
  const name = nameInput.value.trim() || 'Player';
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return alert('Enter room code');
  ws.send(JSON.stringify({ type: 'join_room', code, name }));
  codeEl.textContent = code;
};

startBtn.onclick = () => ws.send(JSON.stringify({ type: 'start_game' }));
rollBtn.onclick = () => ws.send(JSON.stringify({ type: 'roll_dice' }));

board.addEventListener('click', (e) => {
  if (movable.length === 0) return;
  const { offsetX: x, offsetY: y } = e;
  const hit = hitTestPiece(x, y);
  if (hit != null && movable.includes(hit.index)) {
    ws.send(JSON.stringify({ type: 'move_piece', pieceIndex: hit.index }));
  }
});

function shortId(id) { return id ? id.slice(0,4) : ''; }

function renderPlayers(players) {
  playersEl.innerHTML = '';
  for (const p of players) {
    if (p.id && !myId && p.name === (nameInput.value.trim() || 'Player')) myId = p.id;
    if (p.id === myId) myColor = p.color;
    const li = document.createElement('li');
    li.textContent = `${p.name} (${p.color})`;
    li.style.color = COLOR_RGB[p.color];
    playersEl.appendChild(li);
  }
}

function updatePieces(players) {
  currentState.players = players;
  currentState.piecesById = {};
  for (const p of players) currentState.piecesById[p.id] = { color: p.color, pieces: p.pieces };
}

const S = 42;
const ORIGIN = 20;

function drawBoard() {
  const ctx = board.getContext('2d');
  ctx.clearRect(0,0,board.width, board.height);
  drawGrid();
  drawHomes();
  drawTrack();
  drawPieces();
}

function drawGrid(){
  const ctx = board.getContext('2d');
  ctx.strokeStyle = '#e5e5e5';
  for (let i=0;i<15;i++){
    ctx.beginPath();
    ctx.moveTo(ORIGIN, ORIGIN + i*S);
    ctx.lineTo(ORIGIN + 15*S, ORIGIN + i*S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ORIGIN + i*S, ORIGIN);
    ctx.lineTo(ORIGIN + i*S, ORIGIN + 15*S);
    ctx.stroke();
  }
}

function drawHomes(){
  const ctx = board.getContext('2d');
  const zones = [
    { x:ORIGIN, y:ORIGIN, c: 'red' },
    { x:ORIGIN+9*S, y:ORIGIN, c: 'green' },
    { x:ORIGIN, y:ORIGIN+9*S, c: 'blue' },
    { x:ORIGIN+9*S, y:ORIGIN+9*S, c: 'yellow' }
  ];
  for (const z of zones){
    ctx.fillStyle = COLOR_RGB[z.c] + '33';
    ctx.fillRect(z.x, z.y, 6*S, 6*S);
  }
}

const RING_POS = (()=>{
  const pos = [];
  const path = [
    ...Array.from({length:5},(_,i)=>[i,6]), [5,5], [5,4], [5,3], [5,2], [5,1],
    ...Array.from({length:5},(_,i)=>[6, i]), [7,0],
    ...Array.from({length:5},(_,i)=>[8, i]), [9,1], [9,2], [9,3], [9,4], [9,5],
    ...Array.from({length:5},(_,i)=>[10,6+i]), [9,6], [8,6], [7,6],
    ...Array.from({length:5},(_,i)=>[6, 9+i]), [5,10], [5,9], [5,8], [5,7],
    ...Array.from({length:5},(_,i)=>[4-i,10]), [0,9],
    ...Array.from({length:5},(_,i)=>[0,8-i]), [1,6], [2,6], [3,6], [4,6]
  ];
  for (const [cx,cy] of path){ pos.push([ORIGIN + (cx+3)*S, ORIGIN + (cy+3)*S]); }
  return pos;
})();

function homePositions(color){
  const map = {
    red:  Array.from({length:6},(_,i)=>[ORIGIN+(6+i)*S, ORIGIN+(8)*S]),
    green:Array.from({length:6},(_,i)=>[ORIGIN+(8)*S, ORIGIN+(6+i)*S]),
    yellow:Array.from({length:6},(_,i)=>[ORIGIN+(8-i)*S, ORIGIN+(8)*S]),
    blue: Array.from({length:6},(_,i)=>[ORIGIN+(8)*S, ORIGIN+(8-i)*S]),
  };
  return map[color];
}

function ringXY(abs){ return RING_POS[abs % 52]; }

function drawTrack(){
  const ctx = board.getContext('2d');
  for (const abs of SAFE_ABS){
    const [x,y] = ringXY(abs);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#bdbdbd';
    ctx.beginPath();
    ctx.arc(x,y, 14, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.fillRect(x-3, y-3, 6, 6);
  }
}

function drawPieces(){
  const ctx = board.getContext('2d');
  if (!currentState.players) return;
  for (const p of currentState.players){
    if (!p.pieces) continue;
    for (let i=0;i<4;i++){
      const rel = p.pieces[i];
      let x, y;
      if (rel === -1){
        const base = { red:[1,1], green:[10,1], yellow:[10,10], blue:[1,10] }[p.color];
        const offsets = [[1,1],[3,1],[1,3],[3,3]];
        const c = offsets[i];
        x = ORIGIN + (base[0]+c[0])*S; y = ORIGIN + (base[1]+c[1])*S;
      } else if (rel >= 0 && rel <= 51){
        const abs = ({ red:0, green:13, yellow:26, blue:39 }[p.color] + rel) % 52;
        [x,y] = ringXY(abs);
      } else if (rel >= 52 && rel <= 57){
        const pos = homePositions(p.color)[rel-52];
        [x,y] = pos;
      }
      ctx.fillStyle = COLOR_RGB[p.color];
      ctx.beginPath();
      ctx.arc(x,y, 14, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
}

function hitTestPiece(x,y){
  if (!currentState.piecesById[myId]) return null;
  const p = currentState.piecesById[myId];
  for (const idx of movable){
    const rel = p.pieces[idx];
    let px, py;
    if (rel === -1){
      const base = { red:[1,1], green:[10,1], yellow:[10,10], blue:[1,10] }[p.color];
      const offsets = [[1,1],[3,1],[1,3],[3,3]];
      const c = offsets[idx];
      px = ORIGIN + (base[0]+c[0])*S; py = ORIGIN + (base[1]+c[1])*S;
    } else if (rel >= 0 && rel <= 51){
      const abs = ({ red:0, green:13, yellow:26, blue:39 }[p.color] + rel) % 52; [px,py] = ringXY(abs);
    } else { [px,py] = homePositions(p.color)[rel-52]; }
    const d2 = (px-x)*(px-x) + (py-y)*(py-y);
    if (d2 <= 16*16) return { index: idx };
  }
  return null;
}

drawBoard();
