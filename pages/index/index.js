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

Page({
  data: {
    hpText: '1000 / 1000',
    enemyHpText: '1000 / 1000',
    ammoText: `${CONFIG.maxAmmo} / ${CONFIG.maxAmmo}`,
    statusText: '请选择你的技能后点击开始游戏',
    timeText: '0.0s',
    gameStarted: false,

    // 我方技能
    skills: [
      { id: SKILL_ALGORITHMIC_DAMAGE, name: '算法伤害', cooldown: 0, available: true, selected: false },
      { id: SKILL_PING_PONG, name: '乒乓球手', cooldown: 0, available: true, selected: false },
      { id: SKILL_BOOLEAN_MOTION, name: '布尔运动', cooldown: 0, available: true, selected: false },
    ],

    // 敌方技能栏（仅展示）
    enemySkills: [
      { id: SKILL_ALGORITHMIC_DAMAGE, name: '算法伤害', cooldown: 10, available: true, selected: false },
      { id: SKILL_PING_PONG, name: '乒乓球手', cooldown: 8, available: true, selected: false },
      { id: SKILL_BOOLEAN_MOTION, name: '布尔运动', cooldown: 12, available: true, selected: false },
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
      this.gameState = createGameState();
      this.render();
    });
  },

  startGame() {
    const selectedSkills = this.data.skills.filter(skill => skill.selected);

    if (selectedSkills.length === 0) {
      this.setData({ statusText: '请先选择至少一个我方技能' });
      return;
    }

    this.setData({ gameStarted: true, statusText: '游戏开始！' });
    this.startNewGame();
  },

  resetGame() {
    this.stopLoop();
    this.inputState = createInputState();
    this.gameState = createGameState();
    this.lastTimestamp = Date.now();

    const resetSkills = this.data.skills.map(skill => ({
      ...skill,
      selected: false,
      cooldown: 0,
      available: true
    }));

    const resetEnemySkills = this.data.enemySkills.map(skill => ({
      ...skill,
      selected: false,
      available: true
    }));

    this.setData({
      gameStarted: false,
      skills: resetSkills,
      enemySkills: resetEnemySkills,
      statusText: '请选择你的技能后点击开始游戏'
    });

    this.updateHud();
    this.render();
  },

  startNewGame() {
    this.stopLoop();
    this.inputState = createInputState();
    this.gameState = createGameState();
    this.lastTimestamp = Date.now();

    const player = this.gameState.entities.player;
    const enemy = this.gameState.entities.enemy;

    // 激活玩家选择的技能
    const selectedPlayerSkills = this.data.skills.filter(skill => skill.selected);
    selectedPlayerSkills.forEach(skill => {
      activateSkill(player, skill.id, this.gameState, enemy);
    });

    // AI 自动随机选择 1~2 个技能
    const allSkills = [SKILL_ALGORITHMIC_DAMAGE, SKILL_PING_PONG, SKILL_BOOLEAN_MOTION];
    const aiSkillCount = 1 + Math.floor(Math.random() * 2); // 1或2个技能

    const aiSelectedIds = [];
    for (let i = 0; i < aiSkillCount; i++) {
      const randomId = allSkills[Math.floor(Math.random() * allSkills.length)];
      if (!aiSelectedIds.includes(randomId)) {
        aiSelectedIds.push(randomId);
        activateSkill(enemy, randomId, this.gameState, player);
      }
    }

    // 更新敌方技能栏显示
    const updatedEnemySkills = this.data.enemySkills.map(skill => ({
      ...skill,
      selected: aiSelectedIds.includes(skill.id)
    }));

    this.setData({
      enemySkills: updatedEnemySkills,
      statusText: `游戏开始！ 你选择了 ${selectedPlayerSkills.map(s => s.name).join('、')} | AI 已自动选择技能`
    });

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
    if (!this.ctx || !this.gameState) return;

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
      statusText = this.gameState.winner === 'player' ? '你赢了！' : 'AI 赢了';
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
        ctx.fillStyle = tile === TILE_WALL ? '#3a3128' 
                       : tile === TILE_COVER ? '#b88646' 
                       : '#ede3d3';

        ctx.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize - 1, cellSize - 1);
      }
    }

    this.drawEntity(this.gameState.entities.player, offsetX, offsetY, cellSize);
    this.drawEntity(this.gameState.entities.enemy, offsetX, offsetY, cellSize);

    this.gameState.bullets.forEach(bullet => {
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
      case 'algorithmic_damage': ctx.fillStyle = '#ffcc00'; break;
      case 'ping_pong': ctx.fillStyle = '#00ffcc'; break;
      case 'boolean_motion': ctx.fillStyle = '#ff00cc'; break;
      default: ctx.fillStyle = '#202020';
    }
    ctx.beginPath();
    ctx.arc(
      offsetX + bullet.x * cellSize,
      offsetY + bullet.y * cellSize,
      Math.max(2, (bullet.radius || 0.18) * cellSize * 1.5),
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  },

  // 技能点击 - 只允许选择我方
  handleSkillTap(event) {
    const skillId = event.currentTarget.dataset.skillId;
    if (this.data.gameStarted) return;

    const updatedSkills = this.data.skills.map(skill => {
      if (skill.id === skillId) {
        return { ...skill, selected: !skill.selected };
      }
      // 互斥
      if ((skillId === SKILL_PING_PONG && skill.id === SKILL_BOOLEAN_MOTION) ||
          (skillId === SKILL_BOOLEAN_MOTION && skill.id === SKILL_PING_PONG)) {
        return { ...skill, selected: false };
      }
      return skill;
    });

    this.setData({ skills: updatedSkills });

    const selected = updatedSkills.filter(s => s.selected);
    this.setData({
      statusText: selected.length > 0 
        ? `我方技能：${selected.map(s => s.name).join('、')}，点击开始游戏` 
        : '请选择你的技能后点击开始游戏'
    });
  },

  updateSkillCooldowns() {
    const player = this.gameState.entities.player;
    const updatedSkills = this.data.skills.map(skill => {
      if (skill.id === player.activeSkill) {
        return {
          ...skill,
          cooldown: player.skillCooldown || 0,
          available: (player.skillCooldown || 0) <= 0
        };
      }
      return skill;
    });

    this.setData({ skills: updatedSkills });
  },

  // 以下控制函数保持你原来的代码
  handleControlStart(event) { /* ... */ },
  handleControlEnd(event) { /* ... */ },
  handleShootDirection(event) { /* ... */ },
  handleShootEnd() { /* ... */ },
  handleShootTap() { /* ... */ },
});