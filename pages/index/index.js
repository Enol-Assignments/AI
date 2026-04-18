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
    shootDirection: 'right', // 默认向右射击
  };
}

Page({
  data: {
    hpText: '1000 / 1000',
    enemyHpText: '1000 / 1000',
    ammoText: `${CONFIG.maxAmmo} / ${CONFIG.maxAmmo}`,
    statusText: '选择技能后点击开始游戏',
    timeText: '0.0s',
    // 游戏状态
    gameStarted: false,
    // 技能相关状态
    skills: [
      { id: SKILL_ALGORITHMIC_DAMAGE, name: '算法伤害', cooldown: 0, available: true, selected: false },
      { id: SKILL_PING_PONG, name: '乒乓球手', cooldown: 0, available: true, selected: false },
      { id: SKILL_BOOLEAN_MOTION, name: '布尔运动', cooldown: 0, available: true, selected: false },
    ],
    // 敌方技能栏
    enemySkills: [
      { id: SKILL_ALGORITHMIC_DAMAGE, name: '算法伤害', cooldown: 10, available: true, selected: false },
      { id: SKILL_PING_PONG, name: '乒乓球手', cooldown: 8, available: true, selected: false },
      { id: SKILL_BOOLEAN_MOTION, name: '布尔运动', cooldown: 12, available: true, selected: false },
    ],
    skillCooldown: 0,
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
      // 初始化游戏状态但不自动开始
      this.gameState = createGameState();
      this.render();
    });
  },

  startGame() {
    // 检查是否选择了技能
    const selectedSkills = this.data.skills.filter(skill => skill.selected);
    const selectedEnemySkills = this.data.enemySkills.filter(skill => skill.selected);

    if (selectedSkills.length === 0) {
      this.setData({ statusText: '请先选择至少一个我方技能' });
      return;
    }

    if (selectedEnemySkills.length === 0) {
      this.setData({ statusText: '请先选择至少一个敌方技能' });
      return;
    }

    // 开始游戏
    this.setData({ gameStarted: true, statusText: '游戏开始！' });
    this.startNewGame();
  },

  resetGame() {
    this.stopLoop();
    this.inputState = createInputState();
    this.gameState = createGameState();
    this.lastTimestamp = Date.now();

    // 重置技能选择
    const resetSkills = this.data.skills.map(skill => ({
      ...skill,
      selected: false,
      cooldown: 0,
      available: true
    }));

    const resetEnemySkills = this.data.enemySkills.map(skill => ({
      ...skill,
      selected: false,
      cooldown: skill.id === 'algorithmic_damage' ? 10 : skill.id === 'ping_pong' ? 8 : 12,
      available: true
    }));

    this.setData({
      gameStarted: false,
      skills: resetSkills,
      enemySkills: resetEnemySkills,
      statusText: '选择技能后点击开始游戏'
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
    const selectedSkills = this.data.skills.filter(skill => skill.selected);
    selectedSkills.forEach(skill => {
      activateSkill(player, skill.id, this.gameState, enemy);
    });

    // 激活敌方选择的技能
    const selectedEnemySkills = this.data.enemySkills.filter(skill => skill.selected);
    selectedEnemySkills.forEach(skill => {
      activateSkill(enemy, skill.id, this.gameState, player);
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
    } else if (player.algorithmicDamageValue) {
      // 显示算法伤害数值
      const numbers = player.algorithmicDamageNumbers;
      statusText = `算法伤害：${numbers[0]} × ${numbers[1]} × ${numbers[2]} = ${player.algorithmicDamageValue}`;
    }

    this.setData({
      hpText: `${Math.ceil(player.hp)} / ${player.maxHp}`,
      enemyHpText: `${Math.ceil(enemy.hp)} / ${enemy.maxHp}`,
      ammoText: `${player.ammo} / ${CONFIG.maxAmmo}`,
      timeText: `${this.gameState.time.toFixed(1)}s`,
      statusText,
    });

    // 更新技能冷却
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

    const player = this.gameState.entities.player;
    this.drawEntity(player, offsetX, offsetY, cellSize);
    this.drawEntity(this.gameState.entities.enemy, offsetX, offsetY, cellSize);

    // 绘制子弹（带技能效果）
    this.gameState.bullets.forEach((bullet) => {
      this.drawBullet(bullet, offsetX, offsetY, cellSize, ctx);
    });
  },

  // 绘制子弹（带技能效果）
  drawBullet(bullet, offsetX, offsetY, cellSize, ctx) {
    ctx.save();

    // 根据技能效果设置子弹样式
    switch (bullet.skillEffect) {
      case 'algorithmic_damage':
        ctx.fillStyle = '#ffcc00';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 10;
        break;
      case 'ping_pong':
        ctx.fillStyle = '#00ffcc';
        ctx.shadowColor = '#00ffcc';
        ctx.shadowBlur = 8;
        break;
      case 'boolean_motion':
        ctx.fillStyle = '#ff00cc';
        ctx.shadowColor = '#ff00cc';
        ctx.shadowBlur = 12;
        break;
      case 'ping_pong_reflected':
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 10;
        break;
      default:
        ctx.fillStyle = '#202020';
    }

    ctx.beginPath();
    ctx.arc(
      offsetX + bullet.x * cellSize,
      offsetY + bullet.y * cellSize,
      Math.max(2, bullet.radius * cellSize * 1.5), // 技能子弹稍大
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.restore();
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

  handleShootDirection(event) {
    const direction = event.currentTarget.dataset.direction;
    this.inputState.shootDirection = direction;
    this.inputState.shoot = true;
  },

  handleShootEnd() {
    this.inputState.shoot = false;
  },

  handleShootTap() {
    // 保持向后兼容，默认向右射击
    this.inputState.shootDirection = 'right';
    this.inputState.shoot = true;
    setTimeout(() => {
      this.inputState.shoot = false;
    }, 80);
  },

  // 技能点击处理
  handleSkillTap(event) {
    const skillId = event.currentTarget.dataset.skillId;
    const isEnemy = event.currentTarget.dataset.isEnemy === 'true';

    // 如果游戏已经开始，不能再选择技能
    if (this.data.gameStarted) {
      return;
    }

    let updatedSkills, updatedEnemySkills;

    if (isEnemy) {
      // 处理敌方技能选择
      updatedEnemySkills = this.data.enemySkills.map(skill => {
        if (skill.id === skillId) {
          return {
            ...skill,
            selected: !skill.selected
          };
        }

        // 乒乓球手和布尔运动不能同时选择
        if ((skillId === SKILL_PING_PONG && skill.id === SKILL_BOOLEAN_MOTION) ||
          (skillId === SKILL_BOOLEAN_MOTION && skill.id === SKILL_PING_PONG)) {
          return {
            ...skill,
            selected: false
          };
        }

        return skill;
      });

      this.setData({
        enemySkills: updatedEnemySkills
      });
    } else {
      // 处理我方技能选择
      updatedSkills = this.data.skills.map(skill => {
        if (skill.id === skillId) {
          return {
            ...skill,
            selected: !skill.selected
          };
        }

        // 乒乓球手和布尔运动不能同时选择
        if ((skillId === SKILL_PING_PONG && skill.id === SKILL_BOOLEAN_MOTION) ||
          (skillId === SKILL_BOOLEAN_MOTION && skill.id === SKILL_PING_PONG)) {
          return {
            ...skill,
            selected: false
          };
        }

        return skill;
      });

      this.setData({
        skills: updatedSkills
      });
    }

    // 更新状态文本
    const selectedSkills = this.data.skills.filter(skill => skill.selected);
    const selectedEnemySkills = this.data.enemySkills.filter(skill => skill.selected);

    let statusText = '';
    if (selectedSkills.length > 0) {
      const skillNames = selectedSkills.map(skill => skill.name).join('、');
      statusText += `我方技能：${skillNames}`;
    }

    if (selectedEnemySkills.length > 0) {
      if (statusText) statusText += ' | ';
      const enemySkillNames = selectedEnemySkills.map(skill => skill.name).join('、');
      statusText += `敌方技能：${enemySkillNames}`;
    }

    if (statusText) {
      this.setData({
        statusText: `${statusText}，点击开始游戏`
      });
    } else {
      this.setData({
        statusText: '选择技能后点击开始游戏'
      });
    }
  },

  // 更新技能冷却
  updateSkillCooldowns() {
    const player = this.gameState.entities.player;
    const updatedSkills = this.data.skills.map(skill => {
      if (skill.id === player.activeSkill) {
        return {
          ...skill,
          cooldown: player.skillCooldown,
          available: player.skillCooldown <= 0
        };
      }
      return skill;
    });

    this.setData({
      skills: updatedSkills
    });
  },
});
