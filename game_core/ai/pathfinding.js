const { TILE_EMPTY, DIRECTIONS } = require('../constants');

function keyOf(x, y) {
  return `${x},${y}`;
}

function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isWalkable(map, x, y) {
  return map[y] && map[y][x] === TILE_EMPTY;
}

/**
 * 使用 A* 计算从起点到终点的网格路径。
 * @param {import('../constants').MapGrid} map
 * @param {import('../constants').GridPosition} startPos
 * @param {import('../constants').GridPosition} targetPos
 * @returns {import('../constants').GridPosition[]}
 */
function findShortestPath(map, startPos, targetPos) {
  const start = { x: Math.round(startPos.x), y: Math.round(startPos.y) };
  const target = { x: Math.round(targetPos.x), y: Math.round(targetPos.y) };

  if (!isWalkable(map, start.x, start.y) || !isWalkable(map, target.x, target.y)) {
    return [];
  }

  const open = [start];
  const cameFrom = {};
  const gScore = { [keyOf(start.x, start.y)]: 0 };
  const fScore = { [keyOf(start.x, start.y)]: heuristic(start, target) };

  while (open.length > 0) {
    open.sort((a, b) => fScore[keyOf(a.x, a.y)] - fScore[keyOf(b.x, b.y)]);
    const current = open.shift();
    const currentKey = keyOf(current.x, current.y);

    if (current.x === target.x && current.y === target.y) {
      const path = [current];
      let cursorKey = currentKey;
      while (cameFrom[cursorKey]) {
        const prev = cameFrom[cursorKey];
        path.unshift(prev);
        cursorKey = keyOf(prev.x, prev.y);
      }
      return path.slice(1);
    }

    DIRECTIONS.forEach((dir) => {
      const next = { x: current.x + dir.x, y: current.y + dir.y };
      const nextKey = keyOf(next.x, next.y);
      if (!isWalkable(map, next.x, next.y)) {
        return;
      }

      const tentativeG = gScore[currentKey] + 1;
      if (tentativeG >= (gScore[nextKey] ?? Infinity)) {
        return;
      }

      cameFrom[nextKey] = current;
      gScore[nextKey] = tentativeG;
      fScore[nextKey] = tentativeG + heuristic(next, target);

      if (!open.some((node) => node.x === next.x && node.y === next.y)) {
        open.push(next);
      }
    });
  }

  return [];
}

module.exports = {
  findShortestPath,
};
