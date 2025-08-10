// Modern Ludo Online Game Client
class LudoGame {
  constructor() {
    this.board = document.getElementById('board');
    this.ctx = this.board.getContext('2d');
    this.ws = null;
    this.myId = null;
    this.myColor = null;
    this.roomCode = null;
    this.currentState = { players: [], piecesById: {} };
    this.movable = [];
    this.gameStarted = false;
    
    // Game constants
    this.COLORS = ['red', 'green', 'yellow', 'blue'];
    this.COLOR_RGB = { 
      red: '#ef4444', 
      green: '#10b981', 
      yellow: '#f59e0b', 
      blue: '#3b82f6' 
    };
    this.COLOR_OFFSET = { red: 0, green: 13, yellow: 26, blue: 39 };
    this.SAFE_ABS = [0, 8, 13, 21, 26, 34, 39, 47];
    
    // Board dimensions
    this.BOARD_SIZE = 800;
    this.CELL_SIZE = 50;
    this.ORIGIN = 50;
    
    this.initializeEventListeners();
    this.connect();
    this.drawBoard();
  }

  initializeEventListeners() {
    // Welcome screen
    document.getElementById('create-room-btn').addEventListener('click', () => this.createRoom());
    document.getElementById('join-room-btn').addEventListener('click', () => this.joinRoom());
    
    // Game screen
    document.getElementById('back-btn').addEventListener('click', () => this.showWelcomeScreen());
    document.getElementById('copy-link').addEventListener('click', () => this.copyRoomLink());
    document.getElementById('start-game').addEventListener('click', () => this.startGame());
    document.getElementById('roll-dice').addEventListener('click', () => this.rollDice());
    
    // Board click handling
    this.board.addEventListener('click', (e) => this.handleBoardClick(e));
    
    // Handle room code from URL
    const urlParams = new URLSearchParams(location.search);
    const codeParam = urlParams.get('room');
    if (codeParam) {
      document.getElementById('room-code').value = codeParam;
    }
  }

  connect() {
    this.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    
    this.ws.onopen = () => {
      console.log('Connected to server');
    };
    
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      this.handleMessage(msg);
    };
    
    this.ws.onclose = () => {
      this.showToast('Connection lost. Please refresh the page.', 'error');
    };
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'room_created':
        this.roomCode = msg.code;
        this.showGameScreen();
        this.updateRoomCode(msg.code);
        this.showToast(`Room created! Share this link: ${msg.link}`, 'success');
        break;
        
      case 'room_update':
        this.roomCode = msg.code;
        this.updateRoomCode(msg.code);
        this.renderPlayers(msg.players);
        this.updatePlayerCount(msg.players.length);
        this.gameStarted = msg.started;
        this.updateStartButton();
        if (msg.turn) this.updateTurn(msg.turn);
        this.updateGameLog(msg.log);
        break;
        
      case 'dice':
        this.showDiceRoll(msg.roll);
        this.movable = msg.movable;
        if (!this.myId) this.myId = msg.player;
        this.disableRollButton();
        break;
        
      case 'state':
        this.updatePieces(msg.players);
        this.updateGameLog(msg.log);
        this.drawBoard();
        break;
        
      case 'turn':
        this.updateTurn(msg.id);
        this.enableRollButton(msg.id === this.myId);
        this.hideDice();
        this.movable = [];
        break;
        
      case 'game_over':
        this.showGameOver(msg.winner);
        break;
        
      case 'error':
        this.showToast(msg.message, 'error');
        break;
    }
  }

  createRoom() {
    const origin = location.origin;
    this.ws.send(JSON.stringify({ type: 'create_room', origin }));
  }

  joinRoom() {
    const name = document.getElementById('player-name').value.trim() || 'Player';
    const code = document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!code) {
      this.showToast('Please enter a room code', 'error');
      return;
    }
    
    this.ws.send(JSON.stringify({ type: 'join_room', code, name }));
    this.showGameScreen();
  }

  startGame() {
    this.ws.send(JSON.stringify({ type: 'start_game' }));
  }

  rollDice() {
    this.ws.send(JSON.stringify({ type: 'roll_dice' }));
  }

  handleBoardClick(e) {
    if (this.movable.length === 0) return;
    
    const rect = this.board.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const hit = this.hitTestPiece(x, y);
    if (hit != null && this.movable.includes(hit.index)) {
      this.ws.send(JSON.stringify({ type: 'move_piece', pieceIndex: hit.index }));
    }
  }

  showWelcomeScreen() {
    document.getElementById('welcome-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('hidden');
  }

  showGameScreen() {
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
  }

  updateRoomCode(code) {
    document.getElementById('code').textContent = code;
  }

  copyRoomLink() {
    const link = `${location.origin}/?room=${this.roomCode}`;
    navigator.clipboard.writeText(link).then(() => {
      this.showToast('Room link copied to clipboard!', 'success');
    });
  }

  renderPlayers(players) {
    const playersEl = document.getElementById('players');
    playersEl.innerHTML = '';
    
    for (const p of players) {
      if (p.id && !this.myId && p.name === (document.getElementById('player-name').value.trim() || 'Player')) {
        this.myId = p.id;
      }
      if (p.id === this.myId) {
        this.myColor = p.color;
      }
      
      const playerItem = document.createElement('div');
      playerItem.className = 'player-item';
      if (p.id === this.myId) playerItem.classList.add('me');
      
      playerItem.innerHTML = `
        <div class="player-avatar" style="background-color: ${this.COLOR_RGB[p.color]}">
          ${p.name.charAt(0).toUpperCase()}
        </div>
        <div class="player-info">
          <div class="player-name">${p.name}</div>
          <div class="player-status">${p.color}</div>
        </div>
      `;
      
      playersEl.appendChild(playerItem);
    }
  }

  updatePlayerCount(count) {
    document.getElementById('player-count').textContent = `${count}/4`;
  }

  updateStartButton() {
    const startBtn = document.getElementById('start-game');
    if (this.gameStarted) {
      startBtn.classList.add('hidden');
    } else {
      startBtn.classList.remove('hidden');
    }
  }

  updateTurn(playerId) {
    const turnEl = document.getElementById('turn');
    if (playerId) {
      const player = this.currentState.players.find(p => p.id === playerId);
      turnEl.textContent = player ? player.name : 'Unknown';
      
      // Update player list to show current turn
      document.querySelectorAll('.player-item').forEach(item => {
        item.classList.remove('current-turn');
      });
      
      const currentPlayerItem = document.querySelector(`[data-player-id="${playerId}"]`);
      if (currentPlayerItem) {
        currentPlayerItem.classList.add('current-turn');
      }
    } else {
      turnEl.textContent = 'Waiting...';
    }
  }

  enableRollButton(isMyTurn) {
    const rollBtn = document.getElementById('roll-dice');
    rollBtn.disabled = !isMyTurn;
  }

  disableRollButton() {
    document.getElementById('roll-dice').disabled = true;
  }

  showDiceRoll(value) {
    const diceContainer = document.getElementById('dice-container');
    const diceValue = document.getElementById('dice-value');
    
    diceValue.textContent = value;
    diceContainer.classList.remove('hidden');
  }

  hideDice() {
    document.getElementById('dice-container').classList.add('hidden');
  }

  updatePieces(players) {
    this.currentState.players = players;
    this.currentState.piecesById = {};
    for (const p of players) {
      this.currentState.piecesById[p.id] = { color: p.color, pieces: p.pieces };
    }
  }

  updateGameLog(log) {
    const logEl = document.getElementById('log');
    logEl.innerHTML = '';
    
    log.forEach(entry => {
      const logEntry = document.createElement('div');
      logEntry.className = 'log-entry';
      logEntry.textContent = entry;
      
      if (entry.includes('won') || entry.includes('Winner')) {
        logEntry.classList.add('winner');
      } else if (entry.includes('captured') || entry.includes('rolled a six')) {
        logEntry.classList.add('important');
      }
      
      logEl.appendChild(logEntry);
    });
    
    logEl.scrollTop = logEl.scrollHeight;
  }

  showGameOver(winner) {
    const overlay = document.getElementById('game-overlay');
    const title = document.getElementById('overlay-title');
    const message = document.getElementById('overlay-message');
    const action = document.getElementById('overlay-action');
    
    title.textContent = 'Game Over!';
    message.textContent = `${winner.name} has won the game!`;
    action.textContent = 'Back to Menu';
    action.onclick = () => this.showWelcomeScreen();
    
    overlay.classList.remove('hidden');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;
    
    document.getElementById('toast-container').appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  // Board rendering methods
  drawBoard() {
    this.ctx.clearRect(0, 0, this.BOARD_SIZE, this.BOARD_SIZE);
    this.drawBackground();
    this.drawGrid();
    this.drawHomes();
    this.drawTrack();
    this.drawPieces();
    this.drawHomeStretch();
  }

  drawBackground() {
    // Main background
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillRect(0, 0, this.BOARD_SIZE, this.BOARD_SIZE);
    
    // Border
    this.ctx.strokeStyle = '#e2e8f0';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(0, 0, this.BOARD_SIZE, this.BOARD_SIZE);
  }

  drawGrid() {
    this.ctx.strokeStyle = '#e2e8f0';
    this.ctx.lineWidth = 1;
    
    for (let i = 0; i <= 16; i++) {
      // Vertical lines
      this.ctx.beginPath();
      this.ctx.moveTo(this.ORIGIN + i * this.CELL_SIZE, this.ORIGIN);
      this.ctx.lineTo(this.ORIGIN + i * this.CELL_SIZE, this.ORIGIN + 16 * this.CELL_SIZE);
      this.ctx.stroke();
      
      // Horizontal lines
      this.ctx.beginPath();
      this.ctx.moveTo(this.ORIGIN, this.ORIGIN + i * this.CELL_SIZE);
      this.ctx.lineTo(this.ORIGIN + 16 * this.CELL_SIZE, this.ORIGIN + i * this.CELL_SIZE);
      this.ctx.stroke();
    }
  }

  drawHomes() {
    const homeZones = [
      { x: this.ORIGIN, y: this.ORIGIN, color: 'red' },
      { x: this.ORIGIN + 10 * this.CELL_SIZE, y: this.ORIGIN, color: 'green' },
      { x: this.ORIGIN, y: this.ORIGIN + 10 * this.CELL_SIZE, color: 'blue' },
      { x: this.ORIGIN + 10 * this.CELL_SIZE, y: this.ORIGIN + 10 * this.CELL_SIZE, color: 'yellow' }
    ];
    
    homeZones.forEach(zone => {
      // Home background
      this.ctx.fillStyle = this.COLOR_RGB[zone.color] + '20';
      this.ctx.fillRect(zone.x, zone.y, 6 * this.CELL_SIZE, 6 * this.CELL_SIZE);
      
      // Home border
      this.ctx.strokeStyle = this.COLOR_RGB[zone.color];
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(zone.x, zone.y, 6 * this.CELL_SIZE, 6 * this.CELL_SIZE);
    });
  }

  drawTrack() {
    // Draw the main track path
    const trackPath = this.getTrackPath();
    
    this.ctx.strokeStyle = '#cbd5e1';
    this.ctx.lineWidth = 2;
    this.ctx.stroke(trackPath);
    
    // Draw safe spots
    this.SAFE_ABS.forEach(abs => {
      const [x, y] = this.getTrackPosition(abs);
      this.drawSafeSpot(x, y);
    });
  }

  drawSafeSpot(x, y) {
    // Safe spot background
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(x, y, 20, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Safe spot border
    this.ctx.strokeStyle = '#3b82f6';
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
    
    // Star icon
    this.ctx.fillStyle = '#3b82f6';
    this.ctx.font = '16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('★', x, y + 5);
  }

  drawHomeStretch() {
    // Draw home stretch paths for each color
    const homeStretches = [
      { color: 'red', startX: this.ORIGIN + 6 * this.CELL_SIZE, startY: this.ORIGIN + 8 * this.CELL_SIZE, direction: 'right' },
      { color: 'green', startX: this.ORIGIN + 8 * this.CELL_SIZE, startY: this.ORIGIN + 6 * this.CELL_SIZE, direction: 'down' },
      { color: 'blue', startX: this.ORIGIN + 8 * this.CELL_SIZE, startY: this.ORIGIN + 8 * this.CELL_SIZE, direction: 'up' },
      { color: 'yellow', startX: this.ORIGIN + 6 * this.CELL_SIZE, startY: this.ORIGIN + 8 * this.CELL_SIZE, direction: 'left' }
    ];
    
    homeStretches.forEach(stretch => {
      this.ctx.strokeStyle = this.COLOR_RGB[stretch.color];
      this.ctx.lineWidth = 3;
      
      for (let i = 0; i < 6; i++) {
        const x = stretch.startX + (stretch.direction === 'right' ? i * this.CELL_SIZE : 0);
        const y = stretch.startY + (stretch.direction === 'down' ? i * this.CELL_SIZE : 
                                   stretch.direction === 'up' ? -i * this.CELL_SIZE : 0);
        
        this.ctx.strokeRect(x - 15, y - 15, 30, 30);
      }
    });
  }

  drawPieces() {
    if (!this.currentState.players) return;
    
    for (const p of this.currentState.players) {
      if (!p.pieces) continue;
      
      for (let i = 0; i < 4; i++) {
        const rel = p.pieces[i];
        let x, y;
        
        if (rel === -1) {
          // Piece in base
          const basePos = this.getBasePosition(p.color, i);
          x = basePos.x;
          y = basePos.y;
        } else if (rel >= 0 && rel <= 51) {
          // Piece on main track
          const abs = (this.COLOR_OFFSET[p.color] + rel) % 52;
          [x, y] = this.getTrackPosition(abs);
        } else if (rel >= 52 && rel <= 57) {
          // Piece in home stretch
          [x, y] = this.getHomeStretchPosition(p.color, rel - 52);
        } else {
          continue; // Piece finished
        }
        
        this.drawPiece(x, y, p.color, i);
      }
    }
  }

  drawPiece(x, y, color, index) {
    const radius = 18;
    
    // Piece shadow
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    this.ctx.beginPath();
    this.ctx.arc(x + 2, y + 2, radius, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Piece background
    this.ctx.fillStyle = this.COLOR_RGB[color];
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Piece border
    this.ctx.strokeStyle = '#1f2937';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    
    // Piece number
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(index + 1, x, y + 5);
  }

  getTrackPath() {
    const path = new Path2D();
    const positions = this.getTrackPositions();
    
    path.moveTo(positions[0][0], positions[0][1]);
    for (let i = 1; i < positions.length; i++) {
      path.lineTo(positions[i][0], positions[i][1]);
    }
    path.closePath();
    
    return path;
  }

  getTrackPositions() {
    const positions = [];
    const path = [
      ...Array.from({length: 5}, (_, i) => [i, 6]), [5, 5], [5, 4], [5, 3], [5, 2], [5, 1],
      ...Array.from({length: 5}, (_, i) => [6, i]), [7, 0],
      ...Array.from({length: 5}, (_, i) => [8, i]), [9, 1], [9, 2], [9, 3], [9, 4], [9, 5],
      ...Array.from({length: 5}, (_, i) => [10, 6 + i]), [9, 6], [8, 6], [7, 6],
      ...Array.from({length: 5}, (_, i) => [6, 9 + i]), [5, 10], [5, 9], [5, 8], [5, 7],
      ...Array.from({length: 5}, (_, i) => [4 - i, 10]), [0, 9],
      ...Array.from({length: 5}, (_, i) => [0, 8 - i]), [1, 6], [2, 6], [3, 6], [4, 6]
    ];
    
    for (const [cx, cy] of path) {
      positions.push([this.ORIGIN + (cx + 3) * this.CELL_SIZE, this.ORIGIN + (cy + 3) * this.CELL_SIZE]);
    }
    
    return positions;
  }

  getTrackPosition(abs) {
    const positions = this.getTrackPositions();
    return positions[abs % 52];
  }

  getBasePosition(color, pieceIndex) {
    const baseOffsets = { red: [1, 1], green: [10, 1], yellow: [10, 10], blue: [1, 10] };
    const pieceOffsets = [[1, 1], [3, 1], [1, 3], [3, 3]];
    
    const base = baseOffsets[color];
    const offset = pieceOffsets[pieceIndex];
    
    return {
      x: this.ORIGIN + (base[0] + offset[0]) * this.CELL_SIZE,
      y: this.ORIGIN + (base[1] + offset[1]) * this.CELL_SIZE
    };
  }

  getHomeStretchPosition(color, index) {
    const homeStretches = {
      red: { x: this.ORIGIN + 6 * this.CELL_SIZE, y: this.ORIGIN + 8 * this.CELL_SIZE, direction: 'right' },
      green: { x: this.ORIGIN + 8 * this.CELL_SIZE, y: this.ORIGIN + 6 * this.CELL_SIZE, direction: 'down' },
      blue: { x: this.ORIGIN + 8 * this.CELL_SIZE, y: this.ORIGIN + 8 * this.CELL_SIZE, direction: 'up' },
      yellow: { x: this.ORIGIN + 6 * this.CELL_SIZE, y: this.ORIGIN + 8 * this.CELL_SIZE, direction: 'left' }
    };
    
    const stretch = homeStretches[color];
    let x = stretch.x;
    let y = stretch.y;
    
    switch (stretch.direction) {
      case 'right': x += index * this.CELL_SIZE; break;
      case 'down': y += index * this.CELL_SIZE; break;
      case 'up': y -= index * this.CELL_SIZE; break;
      case 'left': x -= index * this.CELL_SIZE; break;
    }
    
    return [x, y];
  }

  hitTestPiece(x, y) {
    if (!this.currentState.piecesById[this.myId]) return null;
    
    const p = this.currentState.piecesById[this.myId];
    for (const idx of this.movable) {
      const rel = p.pieces[idx];
      let px, py;
      
      if (rel === -1) {
        const basePos = this.getBasePosition(p.color, idx);
        px = basePos.x;
        py = basePos.y;
      } else if (rel >= 0 && rel <= 51) {
        const abs = (this.COLOR_OFFSET[p.color] + rel) % 52;
        [px, py] = this.getTrackPosition(abs);
      } else if (rel >= 52 && rel <= 57) {
        [px, py] = this.getHomeStretchPosition(p.color, rel - 52);
      } else {
        continue;
      }
      
      const d2 = (px - x) * (px - x) + (py - y) * (py - y);
      if (d2 <= 20 * 20) return { index: idx };
    }
    
    return null;
  }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new LudoGame();
});
