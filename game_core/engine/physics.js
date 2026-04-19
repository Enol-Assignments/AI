const {
  ACTION_IDLE,
  CONFIG,
  TILE_COVER,
  TILE_WALL,
  TILE_EMPTY,
  GRID_SIZE,
} = require('../constants');

const { processSkillBullet } = require('../skills/skillManager');
const { handleBounce, reflectAttack } = require('../skills/pingPong');
const { updateBullet } = require('../skills/booleanMotion');

// ====================== 工具函数 ======================

function toPixels(val) {
  return val * GRID_SIZE;
}

function isWallOrCover(map, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!map[ty] || map[ty][tx] === undefined) return true;
  const tile = map[ty][tx];
  return tile === TILE_WALL || tile === TILE_COVER;
}

// 多点采样检测 + 破坏掩体（针对布尔运动加强版）
function handleBulletWallAndCover(bullet, map) {
  const samples = 10;   // 针对高速追踪子弹增加采样
  const prevX = bullet.x - bullet.vx * 0.025;
  const prevY = bullet.y - bullet.vy * 0.025;

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const checkX = prevX + (bullet.x - prevX) * t;
    const checkY = prevY + (bullet.y - prevY) * t;

    const tx = Math.floor(checkX);
    const ty = Math.floor(checkY);

    if (!map[ty] || map[ty][tx] === undefined) continue;

    const tile = map[ty][tx];

    if (tile === TILE_WALL) {
      if (bullet.skillEffect !== 'ping_pong' && bullet.skillEffect !== 'boolean_motion') {
        return false;
      }
      // 布尔运动碰到墙也消失
      if (bullet.skillEffect === 'boolean_motion') {
        return false;
      }
    }

    if (tile === TILE_COVER) {
      map[ty][tx] = TILE_EMPTY;

      // 所有技能子弹打到箱子都消失
      if (bullet.skillEffect === 'ping_pong' || bullet.skillEffect === 'boolean_motion') {
        return false;
      }
      return false;
    }
  }
  return true;
}

// ====================== 实体移动 ======================

function resolveEntityCollisions(entity, map) {
  const radius = toPixels(entity.radius || CONFIG.entityRadius);
  const ex = toPixels(entity.x);
  const ey = toPixels(entity.y);

  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x] !== TILE_WALL && map[y][x] !== TILE_COVER) continue;

      const rx = x * GRID_SIZE, ry = y * GRID_SIZE;
      const closestX = Math.max(rx, Math.min(ex, rx + GRID_SIZE));
      const closestY = Math.max(ry, Math.min(ey, ry + GRID_SIZE));

      const dx = ex - closestX;
      const dy = ey - closestY;
      const distSq = dx*dx + dy*dy;

      if (distSq < radius*radius && distSq > 0.0001) {
        const dist = Math.sqrt(distSq) || 0.001;
        entity.x += (dx / dist) * (radius - dist + 3) / GRID_SIZE;
        entity.y += (dy / dist) * (radius - dist + 3) / GRID_SIZE;
      }
    }
  }
}

function tryMove(entity, map, moveX, moveY, dt) {
  if (!moveX && !moveY) return;
  const len = Math.sqrt(moveX*moveX + moveY*moveY) || 1;
  const vx = moveX / len;
  const vy = moveY / len;

  const distance = entity.speed * dt;
  const steps = 8;
  const step = distance / steps;

  for (let i = 0; i < steps; i++) {
    entity.x += vx * step;
    entity.y += vy * step;
    entity.x = Math.max(1.0, Math.min(entity.x, map[0].length - 2));
    entity.y = Math.max(1.0, Math.min(entity.y, map.length - 2));
    resolveEntityCollisions(entity, map);
  }
}

// ====================== 子弹更新 - 已优化顺序 ======================

function updateBullets(state, dt) {
  const survivors = [];

  for (let i = 0; i < state.bullets.length; i++) {
    const bullet = state.bullets[i];

    // 生命周期管理
    if (bullet.skillEffect !== 'ping_pong') {
      bullet.lifetime = (bullet.lifetime || CONFIG.bulletLifetime) - dt;
      if (bullet.lifetime <= 0) continue;
    }

    // 移动子弹
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    // === 1. 强制墙和掩体碰撞检测（所有子弹都必须先走这里）===
    if (!handleBulletWallAndCover(bullet, state.map)) {
      continue;   // 子弹消失（包括打到箱子的乒乓球）
    }

    // === 2. 布尔运动专用追踪更新（必须放在墙检测之后）===
    if (bullet.skillEffect === 'boolean_motion' && typeof updateBullet === 'function') {
      updateBullet(bullet, dt, state);
    }

    // === 3. 乒乓球专用反弹处理（放在墙检测之后）===
    if (bullet.skillEffect === 'ping_pong' && typeof handleBounce === 'function') {
      if (!handleBounce(bullet, state)) {
        continue;                 // handleBounce 返回 false 时子弹消失
      }
    }

    // === 4. 子弹击中实体检测 ===
    let hit = false;
    const targets = [state.entities.player, state.entities.enemy];

    for (let target of targets) {
      if (target.id === bullet.ownerId || target.hp <= 0) continue;

      const dx = target.x - bullet.x;
      const dy = target.y - bullet.y;
      const distSq = dx*dx + dy*dy;
      const hitR = (target.radius || CONFIG.entityRadius) + (bullet.radius || CONFIG.bulletRadius);

      if (distSq <= hitR * hitR) {
        const reduced = Math.max(1, bullet.damage - target.def);
        target.hp = Math.max(0, target.hp - reduced);
        target.action = ACTION_IDLE;
        hit = true;
        break;
      }

      if (typeof reflectAttack === 'function' && reflectAttack(target, bullet)) {
        hit = true;
        break;
      }
    }

    if (!hit) {
      survivors.push(bullet);
    }
  }

  state.bullets = survivors;
}

// ====================== 其余函数保持不变 ======================

function updateAmmo(entity, dt) {
  entity.fireCooldown = Math.max(0, entity.fireCooldown - dt);
  if (entity.ammo > 0) {
    entity.reloadTimer = 0;
    return;
  }
  entity.reloadTimer += dt;
  if (entity.reloadTimer >= CONFIG.reloadDuration) {
    entity.ammo = CONFIG.maxAmmo;
    entity.reloadTimer = 0;
  }
}

function buildBullet(owner, target, shootDirection) {
  let vx = 1, vy = 0;
  if (owner.team === 'player' && shootDirection) {
    switch (shootDirection) {
      case 'up':    vx=0; vy=-1; break;
      case 'down':  vx=0; vy=1; break;
      case 'left':  vx=-1; vy=0; break;
      case 'right': vx=1; vy=0; break;
    }
  } else {
    const dx = target.x - owner.x;
    const dy = target.y - owner.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    vx = dx / len; vy = dy / len;
  }

  return {
    ownerId: owner.id,
    ownerTeam: owner.team,
    x: owner.x + vx * (owner.radius + 0.3),
    y: owner.y + vy * (owner.radius + 0.3),
    vx: vx * CONFIG.bulletSpeed,
    vy: vy * CONFIG.bulletSpeed,
    damage: owner.atk,
    radius: CONFIG.bulletRadius,
    lifetime: CONFIG.bulletLifetime,
    skillEffect: owner.activeSkill || null,
  };
}

function tryShoot(entity, command, bullets, fallbackTarget, state) {
  if (!command.shoot || entity.fireCooldown > 0 || entity.ammo <= 0) return;
  const target = command.target || fallbackTarget;
  if (!target) return;

  const bullet = buildBullet(entity, target, command.shootDirection);
  bullets.push(bullet);
  processSkillBullet(entity, bullet, state);

  entity.ammo -= 1;
  entity.fireCooldown = CONFIG.fireCooldown;
  entity.action = 'shoot';
}

function updateWorld(state, commands, dt) {
  const player = state.entities.player;
  const enemy = state.entities.enemy;

  updateAmmo(player, dt);
  updateAmmo(enemy, dt);

  const playerCommand = commands.player || { type: ACTION_IDLE, moveX: 0, moveY: 0, shoot: false };
  const enemyCommand = commands.enemy || { type: ACTION_IDLE, moveX: 0, moveY: 0, shoot: false };

  player.action = playerCommand.type;
  enemy.action = enemyCommand.type;

  tryMove(player, state.map, playerCommand.moveX, playerCommand.moveY, dt);
  tryMove(enemy, state.map, enemyCommand.moveX, enemyCommand.moveY, dt);

  tryShoot(player, playerCommand, state.bullets, enemy, state);
  tryShoot(enemy, enemyCommand, state.bullets, player, state);

  updateBullets(state, dt);
}

module.exports = {
  updateWorld,
};