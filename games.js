/* LifeXP — mini-gry offline (Flappy Bird, Snake, 2048).
   Zasada nadrzędna: gry i punkty/Money to osobne światy — zero Firestore,
   zero punktów LifeXP. Jedyny zapis: lokalne rekordy w localStorage.
   Vanilla JS + <canvas>, bez zewnętrznych bibliotek. */
(function () {
  'use strict';

  const t = (key, opts) => (window.i18next ? i18next.t('games.' + key, opts) : key);
  const $ = (id) => document.getElementById(id);
  const cssVar = (name, fallback) =>
    (getComputedStyle(document.body).getPropertyValue(name) || '').trim() || fallback;

  const GAMES = {
    flappy: { emoji: '🐤', nameKey: 'flappyName', hintKey: 'flappyHint', hsKey: 'lifexp-game-highscore-flappy' },
    snake:  { emoji: '🐍', nameKey: 'snakeName',  hintKey: 'snakeHint',  hsKey: 'lifexp-game-highscore-snake' },
    g2048:  { emoji: '🔢', nameKey: 'g2048Name',  hintKey: 'g2048Hint',  hsKey: 'lifexp-game-highscore-2048' },
  };

  const getBest = (id) => { try { return parseInt(localStorage.getItem(GAMES[id].hsKey)) || 0; } catch (e) { return 0; } };
  const setBest = (id, v) => { try { localStorage.setItem(GAMES[id].hsKey, String(v)); } catch (e) {} };

  let activeGame = null;   // id aktywnej gry
  let engine = null;       // { stop() } — bieżący silnik gry
  let rafId = 0;

  // ── Menu (3 kafelki z rekordami) ──────────────────────
  function renderMenu() {
    const el = $('games-menu');
    if (!el) return;
    el.innerHTML = Object.keys(GAMES).map((id) => {
      const g = GAMES[id];
      return `<div class="game-tile" onclick="LifeXPGames.open('${id}')">
        <div class="gt-emoji">${g.emoji}</div>
        <div class="gt-name">${t(g.nameKey)}</div>
        <div class="gt-best">${t('bestLabel', { n: getBest(id) })}</div>
      </div>`;
    }).join('');
  }

  function showMenu() {
    stopEngine();
    activeGame = null;
    const play = $('games-play');
    if (play) play.style.display = 'none';
    const menu = $('games-menu');
    if (menu) menu.style.display = 'grid';
    renderMenu();
  }

  function stopEngine() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (engine && engine.stop) engine.stop();
    engine = null;
  }

  // ── Wspólne: canvas, wynik, wejście ───────────────────
  function setScore(n) { const el = $('games-score'); if (el) el.textContent = n; }
  function setBestLabel(n) { const el = $('games-best'); if (el) el.textContent = n; }

  // Zwraca { canvas, ctx, W, H } — rozmiar wg realnej szerokości kontenera
  // (canvas NIGDY nie może rozpychać strony w poziomie na telefonie).
  function setupCanvas(aspect) {
    const canvas = $('games-canvas');
    const cssW = Math.max(200, Math.min(420, canvas.clientWidth || canvas.parentElement.clientWidth - 28));
    const cssH = Math.round(cssW * aspect);
    canvas.style.height = cssH + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas, ctx, W: cssW, H: cssH };
  }

  function drawOverlay(ctx, W, H, title, subtitle) {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '700 20px ' + cssVar('--font', 'sans-serif');
    ctx.fillText(title, W / 2, H / 2 - 8);
    if (subtitle) {
      ctx.font = '500 13px ' + cssVar('--font', 'sans-serif');
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillText(subtitle, W / 2, H / 2 + 18);
    }
  }

  function finishGame(score) {
    if (score > getBest(activeGame)) {
      setBest(activeGame, score);
      setBestLabel(score);
    }
  }

  // Klawiatura: aktywna tylko gdy gra działa i strona gier jest widoczna.
  const HANDLED_KEYS = [' ', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  document.addEventListener('keydown', (e) => {
    if (!engine || !activeGame) return;
    const page = $('page-games');
    if (!page || !page.classList.contains('active')) return;
    if (!HANDLED_KEYS.includes(e.key) && e.code !== 'Space') return;
    e.preventDefault();
    if ((e.key === ' ' || e.code === 'Space') && engine.onTap) engine.onTap();
    const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (dirs[e.key] && engine.onDir) engine.onDir(dirs[e.key]);
  });

  // Dotyk/mysz: tap + swipe (priorytet mobile).
  function bindPointer(canvas) {
    let sx = 0, sy = 0, st = 0;
    const down = (e) => {
      e.preventDefault();
      const p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY; st = Date.now();
    };
    const up = (e) => {
      e.preventDefault();
      if (!engine) return;
      const p = e.changedTouches ? e.changedTouches[0] : e;
      const dx = p.clientX - sx, dy = p.clientY - sy;
      const dist = Math.hypot(dx, dy);
      if (dist > 24 && engine.onDir) {
        engine.onDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      } else if (dist <= 24 && Date.now() - st < 600 && engine.onTap) {
        engine.onTap();
      }
    };
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchend', up, { passive: false });
    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mouseup', up);
    return () => {
      canvas.removeEventListener('touchstart', down);
      canvas.removeEventListener('touchend', up);
      canvas.removeEventListener('mousedown', down);
      canvas.removeEventListener('mouseup', up);
    };
  }

  // Pętla rAF z autostopem, gdy user wyjdzie ze strony gier inną nawigacją.
  function runLoop(step) {
    let last = performance.now();
    const frame = (now) => {
      const page = $('page-games');
      if (!engine || !page || !page.classList.contains('active')) { stopEngine(); return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  // ── Flappy Bird ───────────────────────────────────────
  function startFlappy() {
    const { canvas, ctx, W, H } = setupCanvas(1.25);
    const accent = cssVar('--accent', '#6c63ff');
    const accent2 = cssVar('--accent2', '#4ecca3');
    const GRAVITY = H * 3.1, FLAP = -H * 0.72, PIPE_W = 54, GAP = H * 0.30, SPEED = W * 0.42;
    let bird, pipes, score, state, diedAt;

    function reset() {
      bird = { x: W * 0.28, y: H * 0.45, vy: 0, r: 12 };
      pipes = [];
      score = 0; setScore(0);
      state = 'ready';
    }

    function spawnPipe() {
      const margin = 40;
      const gapY = margin + Math.random() * (H - GAP - margin * 2);
      pipes.push({ x: W + PIPE_W, gapY, passed: false });
    }

    function die() {
      state = 'over'; diedAt = Date.now();
      finishGame(score);
    }

    function step(dt) {
      if (state === 'playing') {
        bird.vy += GRAVITY * dt;
        bird.y += bird.vy * dt;
        if (pipes.length === 0 || pipes[pipes.length - 1].x < W - W * 0.52) spawnPipe();
        pipes.forEach((p) => { p.x -= SPEED * dt; });
        pipes = pipes.filter((p) => p.x > -PIPE_W);
        for (const p of pipes) {
          if (!p.passed && p.x + PIPE_W < bird.x - bird.r) { p.passed = true; score++; setScore(score); }
          const inX = bird.x + bird.r > p.x && bird.x - bird.r < p.x + PIPE_W;
          if (inX && (bird.y - bird.r < p.gapY || bird.y + bird.r > p.gapY + GAP)) die();
        }
        if (bird.y + bird.r > H || bird.y - bird.r < 0) die();
      }

      // Rysowanie
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = accent2;
      pipes.forEach((p) => {
        ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
        ctx.fillRect(p.x, p.gapY + GAP, PIPE_W, H - p.gapY - GAP);
      });
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(bird.x, bird.y, bird.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(bird.x + 4, bird.y - 3, 3, 0, Math.PI * 2);
      ctx.fill();

      if (state === 'ready') drawOverlay(ctx, W, H, t('flappyName'), t('tapToStart'));
      if (state === 'over') drawOverlay(ctx, W, H, t('gameOver'), t('tapToRestart'));
    }

    const unbind = bindPointer(canvas);
    engine = {
      stop: unbind,
      onTap() {
        if (state === 'ready') { state = 'playing'; bird.vy = FLAP; }
        else if (state === 'playing') bird.vy = FLAP;
        else if (state === 'over' && Date.now() - diedAt > 500) reset();
      },
    };
    reset();
    runLoop(step);
  }

  // ── Snake ─────────────────────────────────────────────
  function startSnake() {
    const { canvas, ctx, W, H } = setupCanvas(1);
    const COLS = 20, ROWS = 20;
    const cell = Math.floor(Math.min(W, H) / COLS);
    const ox = Math.floor((W - cell * COLS) / 2), oy = Math.floor((H - cell * ROWS) / 2);
    const accent = cssVar('--accent', '#6c63ff');
    const warn = cssVar('--warn', '#ff6b6b');
    const TICK = 0.12;
    let snake, dir, dirQueue, food, score, state, acc, diedAt;

    function reset() {
      snake = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
      dir = 'right'; dirQueue = [];
      score = 0; setScore(0);
      state = 'ready'; acc = 0;
      placeFood();
    }

    function placeFood() {
      do {
        food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      } while (snake.some((s) => s.x === food.x && s.y === food.y));
    }

    function die() { state = 'over'; diedAt = Date.now(); finishGame(score); }

    const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
    function tick() {
      if (dirQueue.length) {
        const next = dirQueue.shift();
        if (next !== OPP[dir]) dir = next;
      }
      const head = { ...snake[0] };
      if (dir === 'up') head.y--; if (dir === 'down') head.y++;
      if (dir === 'left') head.x--; if (dir === 'right') head.x++;
      if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS
        || snake.some((s) => s.x === head.x && s.y === head.y)) return die();
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) { score++; setScore(score); placeFood(); }
      else snake.pop();
    }

    function step(dt) {
      if (state === 'playing') {
        acc += dt;
        while (acc >= TICK && state === 'playing') { acc -= TICK; tick(); }
      }

      ctx.clearRect(0, 0, W, H);
      // Jedzenie
      ctx.fillStyle = warn;
      ctx.beginPath();
      ctx.arc(ox + food.x * cell + cell / 2, oy + food.y * cell + cell / 2, cell * 0.38, 0, Math.PI * 2);
      ctx.fill();
      // Wąż
      ctx.fillStyle = accent;
      snake.forEach((s, i) => {
        ctx.globalAlpha = i === 0 ? 1 : Math.max(0.45, 1 - i * 0.03);
        ctx.fillRect(ox + s.x * cell + 1, oy + s.y * cell + 1, cell - 2, cell - 2);
      });
      ctx.globalAlpha = 1;

      if (state === 'ready') drawOverlay(ctx, W, H, t('snakeName'), t('tapToStart'));
      if (state === 'over') drawOverlay(ctx, W, H, t('gameOver'), t('tapToRestart'));
    }

    const unbind = bindPointer(canvas);
    engine = {
      stop: unbind,
      onTap() {
        if (state === 'ready') state = 'playing';
        else if (state === 'over' && Date.now() - diedAt > 500) reset();
      },
      onDir(d) {
        if (state === 'ready') state = 'playing';
        if (state === 'playing' && dirQueue.length < 2) dirQueue.push(d);
      },
    };
    reset();
    runLoop(step);
  }

  // ── 2048 ──────────────────────────────────────────────
  function start2048() {
    const { canvas, ctx, W, H } = setupCanvas(1);
    const N = 4, PAD = 10;
    const cell = (Math.min(W, H) - PAD * (N + 1)) / N;
    const font = cssVar('--font', 'sans-serif');
    const TILE_COLORS = {
      2: '#3a3d4d', 4: '#454960', 8: '#6c63ff', 16: '#5a52e0',
      32: '#4ecca3', 64: '#3db38e', 128: '#ffd700', 256: '#f5c842',
      512: '#ff9f43', 1024: '#ff6b6b', 2048: '#e05555',
    };
    let board, score, state, diedAt;

    function reset() {
      board = Array.from({ length: N }, () => Array(N).fill(0));
      score = 0; setScore(0);
      state = 'playing';
      addTile(); addTile();
      draw();
    }

    function addTile() {
      const free = [];
      board.forEach((row, y) => row.forEach((v, x) => { if (!v) free.push({ x, y }); }));
      if (!free.length) return;
      const p = free[Math.floor(Math.random() * free.length)];
      board[p.y][p.x] = Math.random() < 0.9 ? 2 : 4;
    }

    // Przesunięcie jednego wiersza w lewo z łączeniem; zwraca { row, gained, moved }.
    function slideRow(row) {
      const vals = row.filter((v) => v);
      let gained = 0;
      for (let i = 0; i < vals.length - 1; i++) {
        if (vals[i] === vals[i + 1]) { vals[i] *= 2; gained += vals[i]; vals.splice(i + 1, 1); }
      }
      while (vals.length < N) vals.push(0);
      return { row: vals, gained, moved: vals.some((v, i) => v !== row[i]) };
    }

    function move(dir) {
      if (state !== 'playing') return;
      let moved = false, gained = 0;
      const get = (i, j) => {
        if (dir === 'left') return board[i][j];
        if (dir === 'right') return board[i][N - 1 - j];
        if (dir === 'up') return board[j][i];
        return board[N - 1 - j][i]; // down
      };
      const set = (i, j, v) => {
        if (dir === 'left') board[i][j] = v;
        else if (dir === 'right') board[i][N - 1 - j] = v;
        else if (dir === 'up') board[j][i] = v;
        else board[N - 1 - j][i] = v;
      };
      for (let i = 0; i < N; i++) {
        const row = [];
        for (let j = 0; j < N; j++) row.push(get(i, j));
        const r = slideRow(row);
        if (r.moved) moved = true;
        gained += r.gained;
        for (let j = 0; j < N; j++) set(i, j, r.row[j]);
      }
      if (!moved) return;
      score += gained; setScore(score);
      addTile();
      if (!canMove()) { state = 'over'; diedAt = Date.now(); finishGame(score); }
      draw();
    }

    function canMove() {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!board[y][x]) return true;
        if (x + 1 < N && board[y][x] === board[y][x + 1]) return true;
        if (y + 1 < N && board[y][x] === board[y + 1][x]) return true;
      }
      return false;
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const bx = (W - (cell * N + PAD * (N + 1))) / 2;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const px = bx + PAD + x * (cell + PAD), py = PAD + y * (cell + PAD);
        const v = board[y][x];
        ctx.fillStyle = v ? (TILE_COLORS[v] || '#e05555') : 'rgba(255,255,255,.06)';
        roundRect(px, py, cell, cell, 8);
        ctx.fill();
        if (v) {
          ctx.fillStyle = v <= 4 ? '#e8eaf0' : '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const size = v < 128 ? cell * 0.42 : v < 1024 ? cell * 0.34 : cell * 0.28;
          ctx.font = '700 ' + Math.round(size) + 'px ' + font;
          ctx.fillText(String(v), px + cell / 2, py + cell / 2 + 1);
        }
      }
      ctx.textBaseline = 'alphabetic';
      if (state === 'over') drawOverlay(ctx, W, H, t('gameOver'), t('tapToRestart'));
    }

    const unbind = bindPointer(canvas);
    engine = {
      stop: unbind,
      onTap() { if (state === 'over' && Date.now() - diedAt > 500) reset(); },
      onDir(d) { move(d); },
    };
    reset();
  }

  // ── API publiczne ─────────────────────────────────────
  const STARTERS = { flappy: startFlappy, snake: startSnake, g2048: start2048 };

  window.LifeXPGames = {
    showMenu,
    exit: showMenu,
    open(id) {
      if (!GAMES[id]) return;
      stopEngine();
      activeGame = id;
      $('games-menu').style.display = 'none';
      $('games-play').style.display = 'block';
      $('games-play-title').textContent = GAMES[id].emoji + ' ' + t(GAMES[id].nameKey);
      $('games-hint').textContent = t(GAMES[id].hintKey);
      setScore(0);
      setBestLabel(getBest(id));
      STARTERS[id]();
    },
  };
})();
