const { TILE_EMPTY, TILE_WALL, TILE_COVER, DIRECTIONS } = require('../constants');

function createGrid(width, height, fill) {
  return Array.from({ length: height }, () => Array(width).fill(fill));
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

function markSpawnArea(map, cx, cy) {
  for (let y = cy - 1; y <= cy + 1; y += 1) {
    for (let x = cx - 1; x <= cx + 1; x += 1) {
      if (map[y] && map[y][x] !== undefined) {
        map[y][x] = TILE_EMPTY;
      }
    }
  }
}

function hasPathBetween(map, start, target) {
  const queue = [start];
  const visited = new Set([`${start.x},${start.y}`]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.x === target.x && current.y === target.y) {
      return true;
    }

    DIRECTIONS.forEach((dir) => {
      const nextX = current.x + dir.x;
      const nextY = current.y + dir.y;
      const key = `${nextX},${nextY}`;
      if (visited.has(key)) {
        return;
      }

      if (!map[nextY] || map[nextY][nextX] !== TILE_EMPTY) {
        return;
      }

      visited.add(key);
      queue.push({ x: nextX, y: nextY });
    });
  }

  return false;
}

/**
 * 生成一张全连通的迷宫地图。
 * @param {number} width
 * @param {number} height
 * @param {number} breakRate
 * @returns {import('../constants').MapGrid}
 */
function generateMaze(width, height, breakRate) {
  const mazeWidth = width % 2 === 0 ? width + 1 : width;
  const mazeHeight = height % 2 === 0 ? height + 1 : height;
  const map = createGrid(mazeWidth, mazeHeight, TILE_WALL);
  const stack = [{ x: 1, y: 1 }];

  map[1][1] = TILE_EMPTY;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors = shuffle(DIRECTIONS)
      .map((dir) => ({
        wallX: current.x + dir.x,
        wallY: current.y + dir.y,
        x: current.x + dir.x * 2,
        y: current.y + dir.y * 2,
      }))
      .filter((next) => (
        next.x > 0
        && next.y > 0
        && next.x < mazeWidth - 1
        && next.y < mazeHeight - 1
        && map[next.y][next.x] === TILE_WALL
      ));

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const next = neighbors[0];
    map[next.wallY][next.wallX] = TILE_EMPTY;
    map[next.y][next.x] = TILE_EMPTY;
    stack.push({ x: next.x, y: next.y });
  }

  for (let y = 1; y < mazeHeight - 1; y += 1) {
    for (let x = 1; x < mazeWidth - 1; x += 1) {
      if (map[y][x] !== TILE_WALL) {
        continue;
      }

      const horizontal = map[y][x - 1] === TILE_EMPTY && map[y][x + 1] === TILE_EMPTY;
      const vertical = map[y - 1][x] === TILE_EMPTY && map[y + 1][x] === TILE_EMPTY;
      if ((horizontal || vertical) && Math.random() < breakRate) {
        map[y][x] = TILE_EMPTY;
      }
    }
  }

  const playerSpawn = { x: 1, y: 1 };
  const enemySpawn = { x: mazeWidth - 2, y: mazeHeight - 2 };

  for (let y = 1; y < mazeHeight - 1; y += 1) {
    for (let x = 1; x < mazeWidth - 1; x += 1) {
      if (map[y][x] !== TILE_EMPTY) {
        continue;
      }

      const isSpawnZone = (x <= 2 && y <= 2) || (x >= mazeWidth - 3 && y >= mazeHeight - 3);
      if (!isSpawnZone && Math.random() < 0.08) {
        map[y][x] = TILE_COVER;
        if (!hasPathBetween(map, playerSpawn, enemySpawn)) {
          map[y][x] = TILE_EMPTY;
        }
      }
    }
  }

  markSpawnArea(map, playerSpawn.x, playerSpawn.y);
  markSpawnArea(map, enemySpawn.x, enemySpawn.y);
  return map;
}

module.exports = {
  generateMaze,
};
