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

function createInputState() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    shoot: false,
    shootDirection: 'right',
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
    hpText: '1000 / 1000',
    enemyHpText: '1000 / 1000',
    ammoText: `${CONFIG.maxAmmo} / ${CONFIG.maxAmmo}`,
    statusText: '准备就绪',
    timeText: '0.0s',
    gameStarted: false,
    currentDirection: 'right',
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
    this.hudCounter = 0;

    const player = this.gameState.entities.player;
    const enemy = this.gameState.entities.enemy;
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
      currentDirection: this.inputState.shootDirection,
      statusText: selectedPlayerSkills.length > 0
        ? `开局技能：${selectedPlayerSkills.map((skill) => skill.name).join('、')}`
        : '开局无主动技能，先走位开打',
    });

    this.updateHud();
    this.render();
    this.timer = setInterval(() => this.runFrame(), TICK_MS);
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
      offsetX + bullet.x * cellSize,
      offsetY + bullet.y * cellSize,
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

  handleControlStart(event) {
    const { key } = event.currentTarget.dataset;
    if (!key) {
      return;
    }
    this.inputState[key] = true;
  },

  handleControlEnd(event) {
    const { key } = event.currentTarget.dataset;
    if (!key) {
      return;
    }
    this.inputState[key] = false;
  },

  handleShootDirection(event) {
    const { direction } = event.currentTarget.dataset;
    if (!direction) {
      return;
    }
    this.inputState.shootDirection = direction;
    this.inputState.shoot = true;
    this.setData({ currentDirection: direction });
  },

  handleShootEnd() {
    this.inputState.shoot = false;
  },

  handleShootTap() {
    this.inputState.shoot = true;
    setTimeout(() => {
      this.inputState.shoot = false;
    }, 100);
  },
});
