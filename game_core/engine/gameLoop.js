const {
  ACTION_IDLE,
  ACTION_MOVE,
  CONFIG,
  GAME_STATUS_FINISHED,
  GAME_STATUS_READY,
  GAME_STATUS_RUNNING,
  TEAM_ENEMY,
  TEAM_PLAYER,
} = require('../constants');

const { generateMaze } = require('../maze/generator');
const { tickBehaviorTree } = require('../ai/behaviorTree');   // ← 正确路径
const { updateWorld } = require('./physics');
const { initSkills, updateSkills, activateSkill } = require('../skills/skillManager');

function createEntity(id, team, x, y, color, overrides) {
  const entity = Object.assign({
    id,
    team,
    x,
    y,
    hp: 1000,
    maxHp: 1000,
    atk: 16,
    def: 4,
    ammo: CONFIG.maxAmmo,
    speed: CONFIG.playerSpeed,
    fireCooldown: 0,
    reloadTimer: 0,
    radius: CONFIG.entityRadius,
    action: ACTION_IDLE,
    color,
    facingX: team === TEAM_ENEMY ? -1 : 1,
    facingY: 0,
    activeSkill: null,
    skillCooldown: 0,
    skillData: {},
    timeTravelClone: null,
  }, overrides || {});

  // 初始化技能系统
  initSkills(entity);
  return entity;
}

function createGameState() {
  const map = generateMaze(CONFIG.mapWidth, CONFIG.mapHeight, CONFIG.breakRate);
  return {
    map,
    time: 0,
    status: GAME_STATUS_READY,
    winner: '',
    bullets: [],
    entities: {
      player: createEntity('player-1', TEAM_PLAYER, 1, 1, '#2f7cf6', {
        speed: CONFIG.playerSpeed,
      }),
      enemy: createEntity('enemy-1', TEAM_ENEMY, map[0].length - 2, map.length - 2, '#f25f5c', {
        speed: CONFIG.aiSpeed,
        atk: 14,
        def: 3,
      }),
    },
  };
}

function getPlayerCommand(input, enemy) {
  const moveX = input.moveX || 0;
  const moveY = input.moveY || 0;
  return {
    type: moveX || moveY ? ACTION_MOVE : ACTION_IDLE,
    moveX,
    moveY,
    shoot: Boolean(input.shoot),
    shootVector: {
      x: input.facingX || 1,
      y: input.facingY || 0,
    },
    target: { x: enemy.x, y: enemy.y },
  };
}

function applyRageRule(state, dt) {
  if (state.time <= CONFIG.rageTimeLimit) {
    return;
  }

  const damage = CONFIG.rageDamagePerSecond * dt;
  state.entities.player.hp = Math.max(0, state.entities.player.hp - damage);
  state.entities.enemy.hp = Math.max(0, state.entities.enemy.hp - damage);
}

function resolveWinner(state) {
  const player = state.entities.player;
  const enemy = state.entities.enemy;

  if (player.hp <= 0 && enemy.hp <= 0) {
    state.status = GAME_STATUS_FINISHED;
    state.winner = 'draw';
    return;
  }

  if (player.hp <= 0) {
    state.status = GAME_STATUS_FINISHED;
    state.winner = TEAM_ENEMY;
    return;
  }

  if (enemy.hp <= 0) {
    state.status = GAME_STATUS_FINISHED;
    state.winner = TEAM_PLAYER;
  }
}

function stepGame(state, input, dt) {
  if (state.status === GAME_STATUS_FINISHED) {
    return state;
  }

  state.status = GAME_STATUS_RUNNING;
  state.time += dt;

  const player = state.entities.player;
  const enemy = state.entities.enemy;

  // 更新技能状态
  updateSkills(player, dt);
  updateSkills(enemy, dt);

  const commands = {
    player: getPlayerCommand(input, enemy),
    enemy: tickBehaviorTree(enemy, player, state.bullets, state.map),
  };

  updateWorld(state, commands, dt);
  applyRageRule(state, dt);
  resolveWinner(state);
  return state;
}

module.exports = {
  createGameState,
  stepGame,
};
