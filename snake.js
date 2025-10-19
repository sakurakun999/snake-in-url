'use strict';

const GRID_WIDTH = 40;
const SNAKE_CELL = 1;
const FOOD_CELL = 2;
const UP = {x: 0, y: -1};
const DOWN = {x: 0, y: 1};
const LEFT = {x: -1, y: 0};
const RIGHT = {x: 1, y: 0};
const INITIAL_SNAKE_LENGTH = 4;
const BRAILLE_SPACE = '\u2800';
const GRID_SIZE = GRID_WIDTH * 4;

let grid, snake, currentDirection, moveQueue, hasMoved, gamePaused = false, urlRevealed = false, whitespaceReplacementChar;

const directionsByKey = {
  37: LEFT, 38: UP, 39: RIGHT, 40: DOWN,
  87: UP, 65: LEFT, 83: DOWN, 68: RIGHT,
  75: UP, 72: LEFT, 74: DOWN, 76: RIGHT
};

const touchDirs = {up: UP, down: DOWN, left: LEFT, right: RIGHT};

const $ = document.querySelector.bind(document);

function main() {
  detectBrowserUrlWhitespaceEscaping();
  cleanUrl();
  setupEventHandlers();
  drawMaxScore();
  initUrlRevealed();
  startGame();

  let lastFrameTime = Date.now();
  function frameHandler() {
    const now = Date.now();
    if (!gamePaused && now - lastFrameTime >= tickTime()) {
      updateWorld();
      drawWorld();
      lastFrameTime = now;
    }
    requestAnimationFrame(frameHandler);
  }
  requestAnimationFrame(frameHandler);
}

function detectBrowserUrlWhitespaceEscaping() {
  history.replaceState(null, null, `#${BRAILLE_SPACE}${BRAILLE_SPACE}`);
  if (location.hash.indexOf(BRAILLE_SPACE) === -1) {
    console.warn('Browser is escaping whitespace characters on URL');
    const replacementData = pickWhitespaceReplacementChar();
    whitespaceReplacementChar = replacementData[0];
    $('#url-escaping-note').classList.remove('invisible');
    $('#replacement-char-description').textContent = replacementData[1];
  }
}

function cleanUrl() {
  history.replaceState(null, null, location.pathname.replace(/\b\/$/, ''));
}

function setupEventHandlers() {
  document.onkeydown = (event) => {
    const key = event.keyCode;
    if (directionsByKey[key]) {
      changeDirection(directionsByKey[key]);
    }
  };

  Object.entries(touchDirs).forEach(([dir, dirObj]) => {
    $(`#${dir}`).ontouchstart = () => changeDirection(dirObj);
  });

  window.onblur = () => {
    gamePaused = true;
    history.replaceState(null, null, location.hash + '[paused]');
  };

  window.onfocus = () => {
    gamePaused = false;
    drawWorld();
  };

  $('#reveal-url').onclick = (e) => {
    e.preventDefault();
    setUrlRevealed(!urlRevealed);
  };

  document.querySelectorAll('.expandable').forEach(expandable => {
    const expand = expandable.querySelector('.expand-btn');
    const collapse = expandable.querySelector('.collapse-btn');
    const content = expandable.querySelector('.expandable-content');
    const toggle = () => {
      expand.classList.remove('hidden');
      content.classList.remove('hidden');
      expandable.classList.toggle('expanded');
    };
    expand.onclick = collapse.onclick = toggle;
    expandable.ontransitionend = () => {
      const expanded = expandable.classList.contains('expanded');
      expand.classList.toggle('hidden', expanded);
      content.classList.toggle('hidden', !expanded);
    };
  });
}

function initUrlRevealed() {
  setUrlRevealed(Boolean(localStorage.urlRevealed));
}

function setUrlRevealed(value) {
  urlRevealed = value;
  $('#url-container').classList.toggle('invisible', !urlRevealed);
  if (urlRevealed) {
    localStorage.urlRevealed = 'y';
  } else {
    delete localStorage.urlRevealed;
  }
}

function startGame() {
  grid = new Array(GRID_SIZE);
  snake = [];
  for (let x = 0; x < INITIAL_SNAKE_LENGTH; x++) {
    const y = 2;
    snake.unshift({x, y});
    setCellAt(x, y, SNAKE_CELL);
  }
  currentDirection = RIGHT;
  moveQueue = [];
  hasMoved = false;
  dropFood();
}

function updateWorld() {
  if (moveQueue.length) currentDirection = moveQueue.pop();

  const head = snake[0];
  const tail = snake[snake.length - 1];
  let newX = head.x + currentDirection.x;
  let newY = head.y + currentDirection.y;

  const outOfBounds = newX < 0 || newX >= GRID_WIDTH || newY < 0 || newY >= 4;
  const collidesWithSelf = cellAt(newX, newY) === SNAKE_CELL && !(newX === tail.x && newY === tail.y);

  if (outOfBounds || collidesWithSelf) {
    endGame();
    startGame();
    return;
  }

  const eatsFood = cellAt(newX, newY) === FOOD_CELL;
  if (!eatsFood) {
    snake.pop();
    setCellAt(tail.x, tail.y, null);
  }

  setCellAt(newX, newY, SNAKE_CELL);
  snake.unshift({x: newX, y: newY});

  if (eatsFood) dropFood();
}

function endGame() {
  const score = currentScore();
  const maxScore = parseInt(localStorage.maxScore || 0);
  if (score > 0 && score > maxScore && hasMoved) {
    localStorage.maxScore = score;
    localStorage.maxScoreGrid = gridString();
    drawMaxScore();
    showMaxScore();
  }
}

function drawWorld() {
  const score = currentScore();
  const gridStr = gridString();
  let hash = `#|${gridStr}|[score:${score}]`;

  if (urlRevealed) {
    $('#url').textContent = location.href.replace(/#.*$/, '') + hash;
  }

  if (whitespaceReplacementChar) {
    hash = hash.replace(/\u2800/g, whitespaceReplacementChar);
  }

  history.replaceState(null, null, hash);

  if (decodeURIComponent(location.hash) !== hash) {
    console.warn('history.replaceState() throttling detected. Using location.hash fallback');
    location.hash = hash;
  }
}

function gridString() {
  let str = '';
  const base = 0x2800;
  for (let x = 0; x < GRID_WIDTH; x += 2) {
    const idx0 = x + 0 * GRID_WIDTH;
    const idx1 = x + 1 + 0 * GRID_WIDTH;
    const idx2 = x + 2 * GRID_WIDTH;
    const idx3 = x + 1 + 2 * GRID_WIDTH;
    let n = 0
      | (grid[idx0] ? 1 : 0)
      | ((grid[idx0 + GRID_WIDTH] ? 1 : 0) << 1)
      | ((grid[idx2] ? 1 : 0) << 2)
      | (grid[idx1] ? 1 : 0) << 3
      | ((grid[idx1 + GRID_WIDTH] ? 1 : 0) << 4)
      | ((grid[idx3] ? 1 : 0) << 5)
      | ((grid[idx0 + 3 * GRID_WIDTH] ? 1 : 0) << 6)
      | ((grid[idx3 + GRID_WIDTH] ? 1 : 0) << 7);  // 修正: idx3 + GRID_WIDTH は y=3 の x+1
    str += String.fromCharCode(base + n);
  }
  return str;
}

function tickTime() {
  return 125 + snake.length * (75 - 125) / GRID_SIZE;
}

function currentScore() {
  return snake.length - INITIAL_SNAKE_LENGTH;
}

function cellAt(x, y) {
  x = x % GRID_WIDTH;
  if (x < 0) x += GRID_WIDTH;
  return grid[x + y * GRID_WIDTH];
}

function bitAt(x, y) {
  return cellAt(x, y) ? 1 : 0;
}

function setCellAt(x, y, cellType) {
  x = x % GRID_WIDTH;
  if (x < 0) x += GRID_WIDTH;
  grid[x + y * GRID_WIDTH] = cellType;
}

function dropFood() {
  const emptyCells = GRID_SIZE - snake.length;
  if (emptyCells === 0) return;

  let attempts = 0;
  const maxAttempts = GRID_SIZE * 2;  // 確率的探索で高速化
  while (attempts < maxAttempts) {
    const i = Math.floor(Math.random() * GRID_SIZE);
    if (grid[i] !== SNAKE_CELL) {
      grid[i] = FOOD_CELL;
      return;
    }
    attempts++;
  }
  // フォールバック: 線形検索（稀）
  let dropCounter = Math.floor(Math.random() * emptyCells);
  for (let i = 0; i < GRID_SIZE; i++) {
    if (grid[i] !== SNAKE_CELL) {
      if (dropCounter === 0) {
        grid[i] = FOOD_CELL;
        return;
      }
      dropCounter--;
    }
  }
}

function changeDirection(newDir) {
  const lastDir = moveQueue[0] || currentDirection;
  if (newDir.x + lastDir.x !== 0 || newDir.y + lastDir.y !== 0) {
    moveQueue.unshift(newDir);
  }
  hasMoved = true;
}

function drawMaxScore() {
  const maxScore = localStorage.maxScore;
  if (maxScore == null) return;

  const maxScorePoints = maxScore === 1 ? '1 point' : `${maxScore} points`;
  const maxScoreGrid = localStorage.maxScoreGrid;

  $('#max-score-points').textContent = maxScorePoints;
  $('#max-score-grid').textContent = maxScoreGrid;
  $('#max-score-container').classList.remove('hidden');

  $('#share').onclick = (e) => {
    e.preventDefault();
    shareScore(maxScorePoints, maxScoreGrid);
  };
}

function showMaxScore() {
  const container = $('#max-score-container');
  if (container && container.classList.contains('expanded')) return;
  const expandBtn = container?.querySelector('.expand-btn');
  if (expandBtn) expandBtn.click();
}

function shareScore(scorePoints, grid) {
  const message = `|${grid}| Got ${scorePoints} playing this stupid snake game on the browser URL!`;
  const url = $('link[rel=canonical]').href;
  if (navigator.share) {
    navigator.share({text: message, url});
  } else {
    navigator.clipboard.writeText(`${message}\n${url}`)
      .then(() => showShareNote('copied to clipboard'))
      .catch(() => showShareNote('clipboard write failed'));
  }
}

function showShareNote(message) {
  const note = $('#share-note');
  if (note) {
    note.textContent = message;
    note.classList.remove('invisible');
    setTimeout(() => note.classList.add('invisible'), 1000);
  }
}

function pickWhitespaceReplacementChar() {
  const candidates = [
    ['\u0ADF', 'strange symbols'],
    ['\u27CB', 'some weird slashes']
  ];

  const N = 5;
  const canvas = document.createElement('canvas');
  canvas.width = 200;  // 固定サイズで軽量化
  canvas.height = 40;
  const ctx = canvas.getContext('2d');
  ctx.font = '30px system-ui';
  const targetWidth = ctx.measureText(BRAILLE_SPACE.repeat(N)).width;

  for (const [char, desc] of candidates) {
    const str = char.repeat(N);
    const width = ctx.measureText(str).width;
    if (Math.abs(targetWidth - width) / targetWidth > 0.1) continue;

    ctx.clearRect(0, 0, 200, 40);
    ctx.fillText(str, 0, 30);
    const imageData = ctx.getImageData(0, 0, 200, 40);
    const pixelData = imageData.data;
    const totalPixels = (200 * 40) / 4;  // 固定ピクセル数
    let coloredPixels = 0;
    for (let j = 0; j < totalPixels * 4; j += 4) {
      if (pixelData[j + 3] > 0) coloredPixels++;
    }
    if (coloredPixels / totalPixels < 0.15) {
      return [char, desc];
    }
  }

  return ['\u2591', 'some kind of "fog"'];
}

main();
