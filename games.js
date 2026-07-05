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

  // Zwraca true, gdy padł nowy rekord (gry pokazują to na overlayu game over).
  function finishGame(score) {
    if (score > getBest(activeGame)) {
      setBest(activeGame, score);
      setBestLabel(score);
      fireworks();
      return true;
    }
    return false;
  }

  // Fajerwerki przy rekordzie — reużywają .confetti-piece + @keyframes confettiFall
  // ze style.css (klasy są globalne), więc zero dodatkowego CSS.
  function fireworks() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = $('games-canvas');
    const rect = c && c.clientWidth
      ? c.getBoundingClientRect()
      : { left: window.innerWidth * 0.3, top: window.innerHeight * 0.25, width: window.innerWidth * 0.4, height: window.innerHeight * 0.3 };
    const colors = ['#6c63ff', '#4ecca3', '#ffd700', '#ff6b6b'];
    for (let burst = 0; burst < 3; burst++) {
      setTimeout(() => {
        const cx = rect.left + rect.width * (0.25 + Math.random() * 0.5);
        const cy = rect.top + rect.height * (0.2 + Math.random() * 0.4);
        for (let i = 0; i < 16; i++) {
          const p = document.createElement('div');
          p.className = 'confetti-piece';
          p.style.left = cx + 'px';
          p.style.top = cy + 'px';
          p.style.background = colors[(i + burst) % colors.length];
          const ang = (i / 16) * Math.PI * 2;
          const dist = 60 + Math.random() * 90;
          p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
          p.style.setProperty('--dy', (Math.sin(ang) * dist + 60) + 'px');
          p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
          p.style.setProperty('--dur', (0.9 + Math.random() * 0.6) + 's');
          document.body.appendChild(p);
          setTimeout(() => p.remove(), 1800);
        }
      }, burst * 180);
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
    // Fizyka wg oryginalnego Flappy Bird (ekran 288x512, logika 30 fps):
    // grawitacja 1 px/klatkę², trzepot -9 px/klatkę, max opadanie 10 px/klatkę,
    // rury 4 px/klatkę, szerokość rury 52 px, przerwa ~100 px, nowa rura co ~1,4 s.
    // Przeliczone na px/s (x30 i x900) i przeskalowane do rozmiaru canvasa.
    const SX = W / 288, SY = H / 512;
    const GRAVITY = 900 * SY;
    const FLAP = -270 * SY;
    const MAX_FALL = 300 * SY;
    const SPEED = 120 * SX;
    const PIPE_W = 52 * SX;
    const GAP = 110 * SY; // oryginał ~100 px — odrobinę luźniej pod sterowanie dotykiem
    const PIPE_SPACING = 168 * SX;
    let bird, pipes, score, state, diedAt, isRecord;

    function reset() {
      bird = { x: W * 0.28, y: H * 0.45, vy: 0, r: 12 * SY };
      pipes = [];
      score = 0; setScore(0);
      state = 'ready'; isRecord = false;
    }

    function spawnPipe() {
      const margin = 40 * SY;
      const gapY = margin + Math.random() * (H - GAP - margin * 2);
      pipes.push({ x: W + PIPE_W, gapY, passed: false });
    }

    function die() {
      state = 'over'; diedAt = Date.now();
      isRecord = finishGame(score);
    }

    function step(dt) {
      if (state === 'playing') {
        bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY * dt);
        bird.y += bird.vy * dt;
        // Jak w oryginale: sufit nie zabija — ptak się o niego zatrzymuje.
        if (bird.y - bird.r < 0) { bird.y = bird.r; bird.vy = 0; }
        if (pipes.length === 0 || pipes[pipes.length - 1].x < W - PIPE_SPACING) spawnPipe();
        pipes.forEach((p) => { p.x -= SPEED * dt; });
        pipes = pipes.filter((p) => p.x > -PIPE_W);
        for (const p of pipes) {
          if (!p.passed && p.x + PIPE_W < bird.x - bird.r) { p.passed = true; score++; setScore(score); }
          const inX = bird.x + bird.r > p.x && bird.x - bird.r < p.x + PIPE_W;
          if (inX && (bird.y - bird.r < p.gapY || bird.y + bird.r > p.gapY + GAP)) die();
        }
        if (bird.y + bird.r > H) die();
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
      if (state === 'over') drawOverlay(ctx, W, H, t('gameOver'), isRecord ? t('newRecord', { n: score }) : t('tapToRestart'));
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
    let snake, dir, dirQueue, food, score, state, acc, diedAt, isRecord;

    function reset() {
      snake = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
      dir = 'right'; dirQueue = [];
      score = 0; setScore(0);
      state = 'ready'; acc = 0; isRecord = false;
      placeFood();
    }

    function placeFood() {
      do {
        food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      } while (snake.some((s) => s.x === food.x && s.y === food.y));
    }

    function die() { state = 'over'; diedAt = Date.now(); isRecord = finishGame(score); }

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
      if (state === 'over') drawOverlay(ctx, W, H, t('gameOver'), isRecord ? t('newRecord', { n: score }) : t('tapToRestart'));
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
    let board, score, state, diedAt, isRecord;
    let anim = null; // bieżąca animacja ruchu: { moves, newTile, mergedTargets, start, failsafe }
    const SLIDE_MS = 110, POP_MS = 90;

    function reset() {
      board = Array.from({ length: N }, () => Array(N).fill(0));
      score = 0; setScore(0);
      state = 'playing'; isRecord = false; anim = null;
      addTile(); addTile();
      draw();
    }

    function addTile() {
      const free = [];
      board.forEach((row, y) => row.forEach((v, x) => { if (!v) free.push({ x, y }); }));
      if (!free.length) return null;
      const p = free[Math.floor(Math.random() * free.length)];
      board[p.y][p.x] = Math.random() < 0.9 ? 2 : 4;
      return p;
    }

    // Przesuwa wiersz w lewo (w znormalizowanych współrzędnych) i zwraca listę
    // ruchów kafelków (skąd → dokąd) — z niej rysowana jest animacja przesuwania.
    function slideRowMoves(row) {
      const out = Array(N).fill(0);
      const moves = [];
      let gained = 0, target = 0, lastVal = 0, lastIdx = -1;
      for (let j = 0; j < N; j++) {
        const v = row[j];
        if (!v) continue;
        if (v === lastVal) {
          out[lastIdx] = v * 2;
          gained += v * 2;
          moves.push({ from: j, to: lastIdx, value: v, merged: true });
          lastVal = 0;
        } else {
          out[target] = v;
          moves.push({ from: j, to: target, value: v });
          lastVal = v; lastIdx = target; target++;
        }
      }
      return { row: out, gained, moved: out.some((v, j) => v !== row[j]), moves };
    }

    function move(dir) {
      if (state !== 'playing' || anim) return;
      // Mapowanie znormalizowanych współrzędnych (linia i, pozycja j liczona od
      // krawędzi, w którą przesuwamy) na realne pola siatki.
      const posOf = (i, j) => {
        if (dir === 'left') return { x: j, y: i };
        if (dir === 'right') return { x: N - 1 - j, y: i };
        if (dir === 'up') return { x: i, y: j };
        return { x: i, y: N - 1 - j }; // down
      };
      let moved = false, gained = 0;
      const next = Array.from({ length: N }, () => Array(N).fill(0));
      const allMoves = [];
      for (let i = 0; i < N; i++) {
        const row = [];
        for (let j = 0; j < N; j++) { const p = posOf(i, j); row.push(board[p.y][p.x]); }
        const r = slideRowMoves(row);
        if (r.moved) moved = true;
        gained += r.gained;
        for (let j = 0; j < N; j++) { const p = posOf(i, j); next[p.y][p.x] = r.row[j]; }
        r.moves.forEach((m) => allMoves.push({ from: posOf(i, m.from), to: posOf(i, m.to), value: m.value, merged: m.merged }));
      }
      if (!moved) return;
      board = next;
      score += gained; setScore(score);
      startAnim(allMoves, addTile());
    }

    // Animacja: faza przesuwania (kafelki jadą ze starych pól na nowe, jeszcze ze
    // starymi wartościami), potem faza "pop" (połączone kafelki pulsują, nowy
    // kafelek rośnie od zera). Failsafe finalizuje ruch nawet gdy rAF nie działa
    // (np. karta w tle) — wtedy po prostu bez animacji.
    function startAnim(moves, newTile) {
      const mergedTargets = {};
      moves.forEach((m) => { if (m.merged) mergedTargets[m.to.x + ',' + m.to.y] = true; });
      anim = { moves, newTile, mergedTargets, start: performance.now() };
      anim.failsafe = setTimeout(finalizeMove, SLIDE_MS + POP_MS + 300);
      const frame = (now) => {
        if (!anim) return;
        const el = now - anim.start;
        if (el < SLIDE_MS) drawSlide(el / SLIDE_MS);
        else if (el < SLIDE_MS + POP_MS) drawPop((el - SLIDE_MS) / POP_MS);
        else { finalizeMove(); return; }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }

    function finalizeMove() {
      if (!anim) return;
      clearTimeout(anim.failsafe);
      anim = null;
      if (!canMove()) { state = 'over'; diedAt = Date.now(); isRecord = finishGame(score); }
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

    const boardX = (W - (cell * N + PAD * (N + 1))) / 2;
    const cellPx = (x, y) => ({ px: boardX + PAD + x * (cell + PAD), py: PAD + y * (cell + PAD) });

    function drawGrid() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const { px, py } = cellPx(x, y);
        roundRect(px, py, cell, cell, 8);
        ctx.fill();
      }
    }

    function drawTile(px, py, v, scale) {
      const s = scale || 1;
      const off = (cell * (1 - s)) / 2;
      ctx.fillStyle = TILE_COLORS[v] || '#e05555';
      roundRect(px + off, py + off, cell * s, cell * s, 8 * s);
      ctx.fill();
      ctx.fillStyle = v <= 4 ? '#e8eaf0' : '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const size = (v < 128 ? cell * 0.42 : v < 1024 ? cell * 0.34 : cell * 0.28) * s;
      ctx.font = '700 ' + Math.round(size) + 'px ' + font;
      ctx.fillText(String(v), px + cell / 2, py + cell / 2 + 1);
    }

    // Faza 1: kafelki jadą ze starych pól na nowe (jeszcze ze starymi wartościami).
    function drawSlide(tt) {
      const e = 1 - Math.pow(1 - tt, 3); // easeOutCubic
      drawGrid();
      anim.moves.forEach((m) => {
        const a = cellPx(m.from.x, m.from.y), b = cellPx(m.to.x, m.to.y);
        drawTile(a.px + (b.px - a.px) * e, a.py + (b.py - a.py) * e, m.value, 1);
      });
      ctx.textBaseline = 'alphabetic';
    }

    // Faza 2: plansza po ruchu — połączone kafelki pulsują, nowy rośnie od zera.
    function drawPop(tt) {
      drawGrid();
      const popS = 1 + 0.12 * Math.sin(tt * Math.PI);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = board[y][x];
        if (!v) continue;
        const { px, py } = cellPx(x, y);
        let s = 1;
        if (anim.mergedTargets[x + ',' + y]) s = popS;
        if (anim.newTile && anim.newTile.x === x && anim.newTile.y === y) s = Math.max(0.15, tt);
        drawTile(px, py, v, s);
      }
      ctx.textBaseline = 'alphabetic';
    }

    function draw() {
      drawGrid();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = board[y][x];
        if (!v) continue;
        const { px, py } = cellPx(x, y);
        drawTile(px, py, v, 1);
      }
      ctx.textBaseline = 'alphabetic';
      if (state === 'over') drawOverlay(ctx, W, H, t('gameOver'), isRecord ? t('newRecord', { n: score }) : t('tapToRestart'));
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
