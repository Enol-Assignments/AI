const { 
  TILE_EMPTY, 
  TILE_WALL, 
  TILE_COVER, 
  DIRECTIONS 
} = require('../constants');

const SAFETY_BUFFER = 1;   // 先用 1，如果还卡角可以改为 2

function keyOf(x, y) {
  return `${Math.floor(x)},${Math.floor(y)}`;
}

function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isWalkable(map, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);

  if (!map[ty] || map[ty][tx] !== TILE_EMPTY) {
    return false;
  }

  for (let dy = -SAFETY_BUFFER; dy <= SAFETY_BUFFER; dy++) {
    for (let dx = -SAFETY_BUFFER; dx <= SAFETY_BUFFER; dx++) {
      const checkX = tx + dx;
      const checkY = ty + dy;
      if (checkX < 0 || checkX >= map[0].length || checkY < 0 || checkY >= map.length) {
        return false;
      }
      if (map[checkY][checkX] === TILE_WALL || map[checkY][checkX] === TILE_COVER) {
        return false;
      }
    }
  }
  return true;
}

function findShortestPath(map, startPos, targetPos) {
  const start = { x: Math.floor(startPos.x), y: Math.floor(startPos.y) };
  const target = { x: Math.floor(targetPos.x), y: Math.floor(targetPos.y) };

  if (!isWalkable(map, start.x, start.y)) {
    return findNearestWalkable(map, start);
  }

  const open = [start];
  const cameFrom = {};
  const gScore = { [keyOf(start.x, start.y)]: 0 };
  const fScore = { [keyOf(start.x, start.y)]: heuristic(start, target) };

  while (open.length > 0) {
    open.sort((a, b) => 
      (fScore[keyOf(a.x, a.y)] || Infinity) - (fScore[keyOf(b.x, b.y)] || Infinity)
    );

    const current = open.shift();
    const currentKey = keyOf(current.x, current.y);

    if (current.x === target.x && current.y === target.y) {
      const path = [current];
      let cursor = currentKey;
      while (cameFrom[cursor]) {
        const prev = cameFrom[cursor];
        path.unshift(prev);
        cursor = keyOf(prev.x, prev.y);
      }
      return path.slice(1);
    }

    for (const dir of DIRECTIONS) {
      const next = { x: current.x + dir.x, y: current.y + dir.y };
      const nextKey = keyOf(next.x, next.y);

      if (!isWalkable(map, next.x, next.y)) continue;

      const tentativeG = gScore[currentKey] + 1;

      if (tentativeG >= (gScore[nextKey] ?? Infinity)) continue;

      cameFrom[nextKey] = current;
      gScore[nextKey] = tentativeG;
      fScore[nextKey] = tentativeG + heuristic(next, target);

      if (!open.some(n => n.x === next.x && n.y === next.y)) {
        open.push(next);
      }
    }
  }

  return findNearestWalkable(map, start);
}

function findNearestWalkable(map, start) {
  for (let r = 1; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = start.x + dx;
        const y = start.y + dy;
        if (isWalkable(map, x, y)) {
          return [{ x, y }];
        }
      }
    }
  }
  return [];
}

module.exports = {
  findShortestPath,   // 必须正确导出这个函数
};