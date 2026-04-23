const {
  CONFIG,
  GAME_STATUS_FINISHED,
  TILE_COVER,
  TILE_WALL,
  SKILL_ALGORITHMIC_DAMAGE,
  SKILL_PING_PONG,
  SKILL_BOOLEAN_MOTION,
} = require('../../game_core/constants');

const { createGameState, stepGame } = require('../../game_core/engine/gameLoop');
const { activateSkill } = require('../../game_core/skills/skillManager');

const TICK_MS = CONFIG.tickMs;
const JOYSTICK_DEAD_ZONE = 0.14;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(x, y) {
  const length = Math.sqrt(x * x + y * y) || 1;
  return { x: x / length, y: y / length };
}

function getPrimaryTouch(event, identifier) {
  const touches = event.touches && event.touches.length ? event.touches : event.changedTouches;
  if (!touches || !touches.length) {
    return null;
  }

  if (identifier === undefined || identifier === null) {
    return touches[0];
  }

  for (let i = 0; i < touches.length; i += 1) {
    if (touches[i].identifier === identifier) {
      return touches[i];
    }
  }

  return null;
}

function createInputState() {
  return {
    moveX: 0,
    moveY: 0,
    shoot: false,
    facingX: 1,
    facingY: 0,
  };
}

function pickRandomSkills(allSkillIds, count) {
  const pool = allSkillIds.slice();
  const result = [];
  while (pool.length > 0 && result.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

Page({
  data: {
    hpText: '300 / 300',
    enemyHpText: '300 / 300',
    ammoText: `${CONFIG.maxAmmo} / ${CONFIG.maxAmmo}`,
    statusText: '准备就绪',
    timeText: '0.0s',
    gameStarted: false,
    shooting: false,
    joystickOffsetX: 0,
    joystickOffsetY: 0,
    canvasHeightPx: 320,
    skills: [
      { id: SKILL_ALGORITHMIC_DAMAGE, name: '算法伤害', cooldown: 0, available: true, selected: false },
      { id: SKILL_PING_PONG, name: '乒乓球手', cooldown: 0, available: true, selected: false },
      { id: SKILL_BOOLEAN_MOTION, name: '布尔运动', cooldown: 0, available: true, selected: false },
    ],
    enemySkills: [
      { id: SKILL_ALGORITHMIC_DAMAGE, name: '算法伤害', selected: false },
      { id: SKILL_PING_PONG, name: '乒乓球手', selected: false },
      { id: SKILL_BOOLEAN_MOTION, name: '布尔运动', selected: false },
    ],
  },

  onReady() {
    this.inputState = createInputState();
    this.gameState = createGameState();
    this.lastTimestamp = Date.now();
    this.hudCounter = 0;
    this.joystickTouchId = null;
    this.shootTouchId = null;
    this.joystickRect = null;
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
      this.updateLayoutMetrics();
      this.startNewGame();
      this.cacheControlRects();
    });
  },

  updateLayoutMetrics() {
    const windowInfo = wx.getWindowInfo();
    const horizontalPadding = 18 * 2 / 2;
    const topBudget = 220;
    const controlBudget = 190;
    const reservedHeight = topBudget + controlBudget;
    const maxCanvasByWidth = Math.max(240, windowInfo.windowWidth - horizontalPadding);
    const maxCanvasByHeight = Math.max(220, windowInfo.windowHeight - reservedHeight);
    const canvasHeightPx = Math.floor(Math.min(maxCanvasByWidth, maxCanvasByHeight, windowInfo.windowHeight * 0.42));
    this.setData({
      canvasHeightPx: Math.max(220, canvasHeightPx),
    });
  },

  startNewGame() {
    this.stopLoop();
    this.inputState = createInputState();
    this.gameState = createGameState();
    this.lastTimestamp = Date.now();
    this.hudCounter = 0;
    this.joystickTouchId = null;
    this.shootTouchId = null;

    const player = this.gameState.entities.player;
    const enemy = this.gameState.entities.enemy;
    enemy.facingX = normalize(player.x - enemy.x, player.y - enemy.y).x;
    enemy.facingY = normalize(player.x - enemy.x, player.y - enemy.y).y;
    const selectedPlayerSkills = this.data.skills.filter((skill) => skill.selected);
    selectedPlayerSkills.forEach((skill) => {
      activateSkill(player, skill.id, this.gameState, enemy);
    });

    const allSkills = [SKILL_ALGORITHMIC_DAMAGE, SKILL_PING_PONG, SKILL_BOOLEAN_MOTION];
    const aiSelectedIds = pickRandomSkills(allSkills, Math.random() > 0.5 ? 2 : 1);
    aiSelectedIds.forEach((skillId) => {
      activateSkill(enemy, skillId, this.gameState, player);
    });

    const enemySkills = this.data.enemySkills.map((skill) => ({
      ...skill,
      selected: aiSelectedIds.includes(skill.id),
    }));

    this.setData({
      gameStarted: true,
      enemySkills,
      shooting: false,
      joystickOffsetX: 0,
      joystickOffsetY: 0,
      statusText: selectedPlayerSkills.length > 0
        ? `开局技能：${selectedPlayerSkills.map((skill) => skill.name).join('、')}`
        : '开局无主动技能，先走位开打',
    });

    this.updateHud();
    this.render();
    this.timer = setInterval(() => this.runFrame(), TICK_MS);
    wx.nextTick(() => this.cacheControlRects());
  },

  resetGame() {
    this.startNewGame();
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
    let statusText = this.data.statusText || '对局进行中';

    if (this.gameState.status === GAME_STATUS_FINISHED) {
      if (this.gameState.winner === 'draw') {
        statusText = '平局，再来一把';
      } else {
        statusText = this.gameState.winner === 'player' ? '你赢了' : 'AI 赢了';
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

    this.updateSkillCooldowns();
  },

  updateSkillCooldowns() {
    const player = this.gameState.entities.player;
    const updatedSkills = this.data.skills.map((skill) => ({
      ...skill,
      cooldown: skill.id === player.activeSkill ? (player.skillCooldown || 0) : 0,
      available: skill.id === player.activeSkill ? (player.skillCooldown || 0) <= 0 : true,
    }));

    this.setData({ skills: updatedSkills });
  },

  render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const map = this.gameState.map;
    const dpr = wx.getWindowInfo().pixelRatio;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const cellSize = Math.min(width / map[0].length, height / map.length);
    const offsetX = (width - map[0].length * cellSize) / 2;
    const offsetY = (height - map.length * cellSize) / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f4efe5';
    ctx.fillRect(0, 0, width, height);

    for (let y = 0; y < map.length; y += 1) {
      for (let x = 0; x < map[0].length; x += 1) {
        const tile = map[y][x];
        ctx.fillStyle = tile === TILE_WALL ? '#3a3128' : tile === TILE_COVER ? '#b88646' : '#ede3d3';
        ctx.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize - 1, cellSize - 1);
      }
    }

    this.drawEntity(this.gameState.entities.player, offsetX, offsetY, cellSize);
    this.drawEntity(this.gameState.entities.enemy, offsetX, offsetY, cellSize);
    this.gameState.bullets.forEach((bullet) => {
      this.drawBullet(bullet, offsetX, offsetY, cellSize, ctx);
    });
  },

  drawEntity(entity, offsetX, offsetY, cellSize) {
    const ctx = this.ctx;
    const centerX = offsetX + (entity.x + 0.5) * cellSize;
    const centerY = offsetY + (entity.y + 0.5) * cellSize;
    ctx.fillStyle = entity.color;
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      entity.radius * cellSize,
      0,
      Math.PI * 2
    );
    ctx.fill();
    this.drawFacingArrow(entity, centerX, centerY, cellSize);
  },

  drawFacingArrow(entity, centerX, centerY, cellSize) {
    const ctx = this.ctx;
    const vector = normalize(entity.facingX || 1, entity.facingY || 0);
    const shaftLength = Math.max(10, entity.radius * cellSize * 1.45);
    const arrowSize = Math.max(5, entity.radius * cellSize * 0.45);
    const startX = centerX + vector.x * entity.radius * cellSize * 0.2;
    const startY = centerY + vector.y * entity.radius * cellSize * 0.2;
    const endX = centerX + vector.x * shaftLength;
    const endY = centerY + vector.y * shaftLength;
    const leftX = endX - vector.x * arrowSize - vector.y * arrowSize * 0.75;
    const leftY = endY - vector.y * arrowSize + vector.x * arrowSize * 0.75;
    const rightX = endX - vector.x * arrowSize + vector.y * arrowSize * 0.75;
    const rightY = endY - vector.y * arrowSize - vector.x * arrowSize * 0.75;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.lineWidth = Math.max(2, cellSize * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  drawBullet(bullet, offsetX, offsetY, cellSize, ctx) {
    ctx.save();
    switch (bullet.skillEffect) {
      case 'algorithmic_damage':
        ctx.fillStyle = '#ffcc00';
        break;
      case 'ping_pong':
        ctx.fillStyle = '#00c2c7';
        break;
      case 'boolean_motion':
        ctx.fillStyle = '#ff5aac';
        break;
      default:
        ctx.fillStyle = '#202020';
    }
    ctx.beginPath();
    ctx.arc(
      offsetX + (bullet.x + 0.5) * cellSize,
      offsetY + (bullet.y + 0.5) * cellSize,
      Math.max(2, (bullet.radius || 0.18) * cellSize * 1.4),
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  },

  handleSkillTap(event) {
    const skillId = event.currentTarget.dataset.skillId;
    const updatedSkills = this.data.skills.map((skill) => {
      if (skill.id === skillId) {
        return { ...skill, selected: !skill.selected };
      }
      if (
        (skillId === SKILL_PING_PONG && skill.id === SKILL_BOOLEAN_MOTION)
        || (skillId === SKILL_BOOLEAN_MOTION && skill.id === SKILL_PING_PONG)
      ) {
        return { ...skill, selected: false };
      }
      return skill;
    });

    const selected = updatedSkills.filter((skill) => skill.selected);
    this.setData({
      skills: updatedSkills,
      statusText: selected.length > 0
        ? `已选择 ${selected.map((skill) => skill.name).join('、')}，下次重开生效`
        : '已清空技能，下次重开生效',
    });
  },

  cacheControlRects() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#move-pad').boundingClientRect();
    query.exec((res) => {
      this.joystickRect = res && res[0] ? res[0] : null;
    });
  },

  updateJoystickFromTouch(touch) {
    if (!touch || !this.joystickRect) {
      return;
    }

    const centerX = this.joystickRect.left + this.joystickRect.width / 2;
    const centerY = this.joystickRect.top + this.joystickRect.height / 2;
    const maxRadius = Math.max(20, this.joystickRect.width * 0.5 - 26);
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > maxRadius) {
      dx = dx / distance * maxRadius;
      dy = dy / distance * maxRadius;
    }

    const normalizedX = dx / maxRadius;
    const normalizedY = dy / maxRadius;
    const magnitude = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);

    if (magnitude < JOYSTICK_DEAD_ZONE) {
      this.inputState.moveX = 0;
      this.inputState.moveY = 0;
    } else {
      this.inputState.moveX = clamp(normalizedX, -1, 1);
      this.inputState.moveY = clamp(normalizedY, -1, 1);
      const facing = normalize(this.inputState.moveX, this.inputState.moveY);
      this.inputState.facingX = facing.x;
      this.inputState.facingY = facing.y;
    }

    this.setData({
      joystickOffsetX: Math.round(dx),
      joystickOffsetY: Math.round(dy),
    });
  },

  resetJoystick() {
    this.inputState.moveX = 0;
    this.inputState.moveY = 0;
    this.joystickTouchId = null;
    this.setData({
      joystickOffsetX: 0,
      joystickOffsetY: 0,
    });
  },

  handleJoystickStart(event) {
    if (!this.joystickRect) {
      this.cacheControlRects();
    }
    const touch = getPrimaryTouch(event);
    if (!touch) {
      return;
    }
    this.joystickTouchId = touch.identifier;
    this.updateJoystickFromTouch(touch);
  },

  handleJoystickMove(event) {
    if (this.joystickTouchId === null || this.joystickTouchId === undefined) {
      return;
    }
    const touch = getPrimaryTouch(event, this.joystickTouchId);
    if (!touch) {
      return;
    }
    this.updateJoystickFromTouch(touch);
  },

  handleJoystickEnd(event) {
    if (this.joystickTouchId === null || this.joystickTouchId === undefined) {
      return;
    }
    const touch = getPrimaryTouch(event, this.joystickTouchId);
    if (touch || (event.changedTouches || []).some((item) => item.identifier === this.joystickTouchId)) {
      this.resetJoystick();
    }
  },

  handleShootStart(event) {
    const touch = getPrimaryTouch(event);
    if (touch) {
      this.shootTouchId = touch.identifier;
    }
    this.inputState.shoot = true;
    this.setData({ shooting: true });
  },

  handleShootEnd() {
    this.shootTouchId = null;
    this.inputState.shoot = false;
    this.setData({ shooting: false });
  },
});
