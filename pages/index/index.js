const {
  CONFIG,
  GAME_STATUS_FINISHED,
  TILE_COVER,
  TILE_WALL,
} = require('../../game_core/constants');
const { createGameState, stepGame } = require('../../game_core/engine/gameLoop');

const TICK_MS = CONFIG.tickMs;

function createInputState() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    shoot: false,
  };
}

Page({
  data: {
    hpText: '100 / 100',
    enemyHpText: '100 / 100',
    ammoText: `${CONFIG.maxAmmo} / ${CONFIG.maxAmmo}`,
    statusText: '点击“重新开始”后进入对战',
    timeText: '0.0s',
  },

  onReady() {
    this.inputState = createInputState();
    this.gameState = createGameState();
    this.lastTimestamp = Date.now();
    this.hudCounter = 0;
    this.setupCanvas();
  },

  onUnload() {
    this.stopLoop();
  },

  setupCanvas() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#game-canvas').fields({ node: true, size: true }).exec((res) => {
      const canvasInfo = res && res[0];
      if (!canvasInfo || !canvasInfo.node) {
        this.setData({ statusText: 'Canvas 初始化失败，请检查基础库版本' });
        return;
      }

      const canvas = canvasInfo.node;
      const dpr = wx.getWindowInfo().pixelRatio;
      canvas.width = canvasInfo.width * dpr;
      canvas.height = canvasInfo.height * dpr;

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      this.canvas = canvas;
      this.ctx = ctx;
      this.startNewGame();
    });
  },

  startNewGame() {
    this.stopLoop();
    this.inputState = createInputState();
    this.gameState = createGameState();
    this.lastTimestamp = Date.now();
    this.updateHud();
    this.render();
    this.timer = setInterval(() => this.runFrame(), TICK_MS);
  },

  stopLoop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  runFrame() {
    if (!this.ctx || !this.gameState) {
      return;
    }

    const now = Date.now();
    const dt = Math.min(0.05, (now - this.lastTimestamp) / 1000 || TICK_MS / 1000);
    this.lastTimestamp = now;

    stepGame(this.gameState, this.inputState, dt);
    this.render();

    this.hudCounter += dt;
    if (this.hudCounter >= 0.1 || this.gameState.status === GAME_STATUS_FINISHED) {
      this.hudCounter = 0;
      this.updateHud();
    }

    if (this.gameState.status === GAME_STATUS_FINISHED) {
      this.stopLoop();
    }
  },

  updateHud() {
    const player = this.gameState.entities.player;
    const enemy = this.gameState.entities.enemy;
    let statusText = '对局进行中';

    if (this.gameState.status === GAME_STATUS_FINISHED) {
      if (this.gameState.winner === 'draw') {
        statusText = '平局，两边都被打趴啦';
      } else if (this.gameState.winner === 'player') {
        statusText = '你赢了，AI 先躺了';
      } else {
        statusText = 'AI 赢了，赶紧复盘再来一把';
      }
    } else if (this.gameState.time > CONFIG.rageTimeLimit) {
      statusText = '狂暴阶段：双方持续掉血';
    }

    this.setData({
      hpText: `${Math.ceil(player.hp)} / ${player.maxHp}`,
      enemyHpText: `${Math.ceil(enemy.hp)} / ${enemy.maxHp}`,
      ammoText: `${player.ammo} / ${CONFIG.maxAmmo}`,
      timeText: `${this.gameState.time.toFixed(1)}s`,
      statusText,
    });
  },

  render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const map = this.gameState.map;
    const width = canvas.width / wx.getWindowInfo().pixelRatio;
    const height = canvas.height / wx.getWindowInfo().pixelRatio;
    const cellSize = Math.min(width / map[0].length, height / map.length);
    const offsetX = (width - map[0].length * cellSize) / 2;
    const offsetY = (height - map.length * cellSize) / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f4efe5';
    ctx.fillRect(0, 0, width, height);

    for (let y = 0; y < map.length; y += 1) {
      for (let x = 0; x < map[0].length; x += 1) {
        const tile = map[y][x];
        if (tile === TILE_WALL) {
          ctx.fillStyle = '#3a3128';
        } else if (tile === TILE_COVER) {
          ctx.fillStyle = '#b88646';
        } else {
          ctx.fillStyle = '#ede3d3';
        }

        ctx.fillRect(
          offsetX + x * cellSize,
          offsetY + y * cellSize,
          cellSize - 1,
          cellSize - 1
        );
      }
    }

    this.drawEntity(this.gameState.entities.player, offsetX, offsetY, cellSize);
    this.drawEntity(this.gameState.entities.enemy, offsetX, offsetY, cellSize);

    ctx.fillStyle = '#202020';
    this.gameState.bullets.forEach((bullet) => {
      ctx.beginPath();
      ctx.arc(
        offsetX + bullet.x * cellSize,
        offsetY + bullet.y * cellSize,
        Math.max(2, bullet.radius * cellSize),
        0,
        Math.PI * 2
      );
      ctx.fill();
    });
  },

  drawEntity(entity, offsetX, offsetY, cellSize) {
    const ctx = this.ctx;
    ctx.fillStyle = entity.color;
    ctx.beginPath();
    ctx.arc(
      offsetX + entity.x * cellSize,
      offsetY + entity.y * cellSize,
      entity.radius * cellSize,
      0,
      Math.PI * 2
    );
    ctx.fill();
  },

  handleControlStart(event) {
    const { key } = event.currentTarget.dataset;
    if (key) {
      this.inputState[key] = true;
    }
  },

  handleControlEnd(event) {
    const { key } = event.currentTarget.dataset;
    if (key) {
      this.inputState[key] = false;
    }
  },

  handleShootTap() {
    this.inputState.shoot = true;
    setTimeout(() => {
      this.inputState.shoot = false;
    }, 80);
  },
});
