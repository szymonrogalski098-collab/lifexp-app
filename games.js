/* LifeXP — mini-gry offline (Łapacz monet, Snake, 2048, Redstone).
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
    coins:    { emoji: '🪙', nameKey: 'coinsName',    hintKey: 'coinsHint',    hsKey: 'lifexp-game-highscore-coins' },
    snake:    { emoji: '🐍', nameKey: 'snakeName',    hintKey: 'snakeHint',    hsKey: 'lifexp-game-highscore-snake' },
    g2048:    { emoji: '🔢', nameKey: 'g2048Name',    hintKey: 'g2048Hint',    hsKey: 'lifexp-game-highscore-2048' },
    redstone: { emoji: '🔴', nameKey: 'redstoneName', hintKey: 'redstoneHint', hsKey: 'lifexp-game-highscore-redstone' },
  };

  const getBest = (id) => { try { return parseInt(localStorage.getItem(GAMES[id].hsKey)) || 0; } catch (e) { return 0; } };
  const setBest = (id, v) => { try { localStorage.setItem(GAMES[id].hsKey, String(v)); } catch (e) {} };

  let activeGame = null;   // id aktywnej gry
  let engine = null;       // { stop() } — bieżący silnik gry
  let rafId = 0;
  let fsMode = false;      // tryb pełnoekranowy (klasa .games-fs na #page-games)

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
    applyFs(false);
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

  // ── Pełny ekran (dla wszystkich gier) ─────────────────
  // Hybryda: klasa .games-fs (in-app maximize, pewna też na iOS) + best-effort
  // Fullscreen API (chowa pasek przeglądarki na Androidzie/desktopie).
  function reinitGame() {
    if (!activeGame || !STARTERS[activeGame]) return;
    stopEngine();
    STARTERS[activeGame]();
  }

  function applyFs(on) {
    fsMode = on;
    const page = $('page-games');
    if (page) page.classList.toggle('games-fs', on);
    reinitGame();  // canvas przeliczy rozmiar wg fsMode (restart bieżącej partii)
  }

  function toggleFullscreen() {
    const target = $('games-play');
    const wantOn = !fsMode;
    try {
      if (wantOn) { if (target && target.requestFullscreen) target.requestFullscreen().catch(() => {}); }
      else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } catch (e) {}
    applyFs(wantOn);
  }

  // Wyjście z fullscreena gestem/Esc (Android/desktop) → zsynchronizuj klasę.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && fsMode) applyFs(false);
  });
  // Obrót/zmiana rozmiaru w trybie fullscreen → dopasuj canvas (debounce).
  let fsResizeT = 0;
  window.addEventListener('resize', () => {
    if (!fsMode || !activeGame) return;
    clearTimeout(fsResizeT);
    fsResizeT = setTimeout(reinitGame, 150);
  });

  // ── Wspólne: canvas, wynik, wejście ───────────────────
  function setScore(n) { const el = $('games-score'); if (el) el.textContent = n; }
  function setBestLabel(n) { const el = $('games-best'); if (el) el.textContent = n; }

  // Zwraca { canvas, ctx, W, H } — rozmiar wg realnej szerokości kontenera
  // (canvas NIGDY nie może rozpychać strony w poziomie na telefonie).
  function setupCanvas(aspect) {
    const canvas = $('games-canvas');
    // Toolbar Redstone stoi OBOK canvasu (wąska kolumna po lewej, patrz
    // .games-canvas-row w app.html), nie nad nim. Dla innych gier ma
    // display:none (offsetWidth=0), więc nic tu się dla nich nie zmienia.
    const toolbarEl = $('games-toolbar');
    const toolbarW = toolbarEl ? toolbarEl.offsetWidth : 0;
    let cssW;
    if (fsMode) {
      // Pełny ekran = sama gra. Chowamy tytuł/hint (CSS), zostaje tylko cienki
      // pasek z wynikiem i „✕", więc canvas wypełnia niemal cały ekran (proporcje zachowane).
      // Trzeba odjąć realną szerokość toolbara od dostępnej szerokości, inaczej
      // para toolbar+canvas wystawałaby poza szerokość ekranu.
      const availW = window.innerWidth - 12 - (toolbarW ? toolbarW + 10 : 0);
      const availH = window.innerHeight - 64;
      cssW = Math.max(240, Math.min(availW, availH / aspect, 1400));
      canvas.style.width = Math.round(cssW) + 'px';
    } else {
      cssW = Math.max(200, Math.min(420, canvas.clientWidth || canvas.parentElement.clientWidth - 28));
      canvas.style.width = '';
    }
    const cssH = Math.round(cssW * aspect);
    canvas.style.height = cssH + 'px';
    // .games-toolbar ma overflow-y:auto, ale bez wysokości jawnie ograniczonej
    // do wysokości canvasu, flexbox rozciąga CAŁY WIERSZ do wysokości
    // najwyższego dziecka (kolumna przycisków), nie odwrotnie — więc bez tego
    // toolbar nigdy by się nie przewijał sam w sobie i strona rosłaby razem z
    // nim (dokładnie ten bug, który mieliśmy naprawić). Ustawiając max-height
    // na realną wysokość canvasu, nadmiar przycisków przewija się WEWNĄTRZ
    // wąskiej kolumny, nigdy nie wymagając scrollowania całej strony.
    if (toolbarEl) toolbarEl.style.maxHeight = cssH + 'px';
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

  // ── Łapacz monet ──────────────────────────────────────
  // Przesuwasz koszyk (palec/mysz/strzałki), łapiesz spadające monety o różnych
  // nominałach, omijasz bomby. Tempo i częstość rosną z czasem. Dużo animacji:
  // obracające się monety, iskry i „+N" przy złapaniu, przechył koszyka, tło z
  // bokeh, flash + wstrząs przy bombie. Wszystko dt-owe; szanuje reduce-motion.
  function startCoins() {
    const { canvas, ctx, W, H } = setupCanvas(1.3);
    const accent = cssVar('--accent', '#6c63ff');
    const accent2 = cssVar('--accent2', '#4ecca3');
    const bg2 = cssVar('--bg2', '#14141c');
    const font = cssVar('--font', 'sans-serif');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const bw = Math.round(W * 0.22), bh = Math.round(W * 0.06);
    const basketY = H - bh - Math.round(H * 0.05);
    const COIN_TYPES = [
      { value: 1, color: '#cfd6e0', edge: '#95a0b0', r: W * 0.033, weight: 0.50 },
      { value: 2, color: '#ffd34d', edge: '#e0a92e', r: W * 0.041, weight: 0.35 },
      { value: 5, color: '#6fe0ff', edge: '#2bb3d6', r: W * 0.046, weight: 0.15 },
    ];

    let basketX, basketVX, targetX, items, particles, floats, bokeh;
    let score, combo, state, elapsed, spawnAcc, spawnEvery, diedAt, isRecord;
    let shakeT, flashA;

    function reset() {
      basketX = W / 2; basketVX = 0; targetX = W / 2;
      items = []; particles = []; floats = []; bokeh = [];
      for (let i = 0; i < 6; i++) bokeh.push({ x: Math.random() * W, y: Math.random() * H, r: 8 + Math.random() * 22, vy: 6 + Math.random() * 12, a: 0.04 + Math.random() * 0.06 });
      score = 0; setScore(0); combo = 0;
      state = 'ready'; elapsed = 0; spawnAcc = 0; spawnEvery = 0.95; isRecord = false;
      shakeT = 0; flashA = 0;
    }

    function pickType() {
      const r = Math.random();
      let acc = 0;
      for (const c of COIN_TYPES) { acc += c.weight; if (r <= acc) return c; }
      return COIN_TYPES[0];
    }

    // Więcej bomb niż w pierwszej wersji + 3 kształty z RÓŻNYM hitboxem (hw/hh).
    const BOMB_SHAPES = ['round', 'tnt', 'spiky'];
    function spawn() {
      const bombP = Math.min(0.45, 0.18 + elapsed * 0.006);
      if (Math.random() < bombP) {
        const shape = BOMB_SHAPES[Math.floor(Math.random() * BOMB_SHAPES.length)];
        let r, hw, hh, vyMul, rot = 0;
        if (shape === 'tnt') {            // laska dynamitu — wąski, wysoki hitbox
          r = W * 0.036; hw = r * 0.85; hh = r * 1.25; vyMul = 1.0;
        } else if (shape === 'spiky') {   // mina morska — rdzeń mniejszy niż grafika (kolce zwodzą)
          r = W * 0.044; hw = hh = r * 0.82; vyMul = 1.15;
        } else {                          // okrągła — hitbox = promień
          r = W * 0.040; hw = hh = r; vyMul = 1.06;
        }
        const half = Math.max(hw, r);
        items.push({ kind: 'bomb', shape, x: half + Math.random() * (W - 2 * half), y: -hh, r, hw, hh, vyMul, fuse: 0, rot });
      } else {
        const tp = pickType();
        items.push({ kind: 'coin', x: tp.r + Math.random() * (W - 2 * tp.r), y: -tp.r, r: tp.r, hw: tp.r, hh: tp.r, spin: Math.random() * Math.PI, value: tp.value, color: tp.color, edge: tp.edge });
      }
    }

    function burst(x, y, color, n) {
      if (reduce) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 130;
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50, life: 0.5 + Math.random() * 0.3, max: 0.8, r: 2 + Math.random() * 2, color });
      }
    }

    function catchItem(it) {
      if (it.kind === 'bomb') { die(); return; }
      score += it.value; setScore(score); combo++;
      burst(it.x, basketY, it.color, 9);
      floats.push({ x: it.x, y: basketY - 6, text: '+' + it.value, life: 0.8, color: it.color });
    }

    function die() {
      state = 'over'; diedAt = Date.now(); combo = 0;
      isRecord = finishGame(score);
      if (!reduce) { shakeT = 0.4; flashA = 0.6; }
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

    function step(dt) {
      if (state === 'playing') {
        elapsed += dt;
        const fall = H * (0.42 + Math.min(0.62, elapsed * 0.012));
        spawnEvery = Math.max(0.42, 0.95 - elapsed * 0.012);
        spawnAcc += dt;
        while (spawnAcc >= spawnEvery) { spawnAcc -= spawnEvery; spawn(); }
        const bx0 = basketX - bw / 2, bx1 = basketX + bw / 2;
        for (const it of items) {
          it.y += fall * (it.vyMul || 1) * dt;
          if (it.kind === 'coin') it.spin += 6 * dt; else it.fuse += dt;
          if (it.caught || it.dead) continue;
          // Kolizja AABB wg hitboxa obiektu (hw/hh) — różne dla kształtów bomb.
          if (it.y + it.hh >= basketY && it.y - it.hh <= basketY + bh && it.x + it.hw >= bx0 && it.x - it.hw <= bx1) {
            it.caught = true; catchItem(it);
          } else if (it.y - it.hh > H) {
            it.dead = true; if (it.kind === 'coin') combo = 0;
          }
        }
        items = items.filter((it) => !it.caught && !it.dead);
      }

      const prev = basketX;
      basketX += (targetX - basketX) * Math.min(1, dt * 14);
      basketX = Math.max(bw / 2, Math.min(W - bw / 2, basketX));
      basketVX = (basketX - prev) / Math.max(dt, 0.001);

      for (const p of particles) { p.vy += 240 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
      particles = particles.filter((p) => p.life > 0);
      for (const f of floats) { f.y -= 34 * dt; f.life -= dt; }
      floats = floats.filter((f) => f.life > 0);
      for (const b of bokeh) { b.y += b.vy * dt; if (b.y - b.r > H) { b.y = -b.r; b.x = Math.random() * W; } }
      if (shakeT > 0) shakeT -= dt;
      if (flashA > 0) flashA = Math.max(0, flashA - dt * 1.6);

      draw();
    }

    function drawCoin(it) {
      const sx = Math.max(0.15, Math.abs(Math.cos(it.spin)));
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.scale(sx, 1);
      const g = ctx.createRadialGradient(-it.r * 0.3, -it.r * 0.3, it.r * 0.2, 0, 0, it.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.28, it.color);
      g.addColorStop(1, it.edge);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, it.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = it.edge; ctx.lineWidth = Math.max(1, it.r * 0.12); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.arc(it.x - it.r * 0.28 * sx, it.y - it.r * 0.3, it.r * 0.14, 0, Math.PI * 2); ctx.fill();
    }

    function fuseSpark(r, fuse) {
      // Wspólny lont + migająca iskra (rysowane w lokalnym układzie obiektu).
      ctx.strokeStyle = '#8a6b3a'; ctx.lineWidth = Math.max(1, r * 0.14);
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.5, -r * 1.4, r * 0.2, -r * 1.65); ctx.stroke();
      if (!reduce && Math.floor(fuse * 10) % 2 === 0) {
        ctx.fillStyle = '#ffcf4d';
        ctx.beginPath(); ctx.arc(r * 0.2, -r * 1.65, r * 0.18, 0, Math.PI * 2); ctx.fill();
      }
    }

    function drawBomb(it) {
      ctx.save();
      ctx.translate(it.x, it.y);
      if (it.shape === 'tnt') {
        // Laska dynamitu — zaokrąglony czerwony prostokąt z opaskami + lont.
        ctx.rotate(reduce ? 0 : Math.sin(it.fuse * 10) * 0.08);
        const w = it.hw * 2, h = it.hh * 2;
        ctx.fillStyle = '#c0392b';
        roundRect(-w / 2, -h / 2, w, h, w * 0.28); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.fillRect(-w / 2, -h * 0.22, w, h * 0.12);
        ctx.fillRect(-w / 2, h * 0.10, w, h * 0.12);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '700 ' + Math.round(w * 0.5) + 'px ' + font;
        ctx.fillText('!', 0, 0);
        ctx.textBaseline = 'alphabetic';
        fuseSpark(it.hh, it.fuse);
      } else if (it.shape === 'spiky') {
        // Mina morska — ciemne koło z kolcami i migającym światełkiem.
        ctx.rotate(it.fuse * 0.8);
        ctx.fillStyle = '#3a3f4b';
        const spikes = 8;
        for (let i = 0; i < spikes; i++) {
          const a = (i / spikes) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * it.r, Math.sin(a) * it.r);
          ctx.lineTo(Math.cos(a) * it.r * 1.4, Math.sin(a) * it.r * 1.4);
          ctx.lineWidth = Math.max(2, it.r * 0.22); ctx.strokeStyle = '#3a3f4b'; ctx.stroke();
        }
        ctx.fillStyle = '#2b2f3a';
        ctx.beginPath(); ctx.arc(0, 0, it.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = (!reduce && Math.floor(it.fuse * 6) % 2 === 0) ? '#ff5050' : '#7a2b2b';
        ctx.beginPath(); ctx.arc(0, 0, it.r * 0.28, 0, Math.PI * 2); ctx.fill();
      } else {
        // Klasyczna okrągła bomba.
        ctx.rotate(reduce ? 0 : Math.sin(it.fuse * 12) * 0.12);
        ctx.fillStyle = '#2b2f3a';
        ctx.beginPath(); ctx.arc(0, 0, it.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a4f5e';
        ctx.beginPath(); ctx.arc(-it.r * 0.3, -it.r * 0.3, it.r * 0.28, 0, Math.PI * 2); ctx.fill();
        fuseSpark(it.r, it.fuse);
      }
      ctx.restore();
    }

    function drawBasket() {
      ctx.save();
      ctx.translate(basketX, basketY + bh / 2);
      ctx.rotate(reduce ? 0 : Math.max(-0.24, Math.min(0.24, basketVX / (W * 6))));
      if (!reduce) { ctx.shadowColor = accent; ctx.shadowBlur = 14; }
      const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
      g.addColorStop(0, accent2); g.addColorStop(1, accent);
      ctx.fillStyle = g;
      roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      roundRect(-bw / 2 + 4, -bh / 2 + 3, bw - 8, bh * 0.32, bh * 0.16);
      ctx.fill();
      ctx.restore();
    }

    function draw() {
      ctx.save();
      if (shakeT > 0 && !reduce) {
        const m = shakeT * 20;
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, bg2);
      bg.addColorStop(1, 'rgba(0,0,0,.28)');
      ctx.fillStyle = bg; ctx.fillRect(-20, -20, W + 40, H + 40);
      if (!reduce) for (const b of bokeh) { ctx.fillStyle = 'rgba(255,255,255,' + b.a + ')'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }
      for (const it of items) { if (it.kind === 'coin') drawCoin(it); else drawBomb(it); }
      drawBasket();
      for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      for (const f of floats) { ctx.globalAlpha = Math.max(0, f.life / 0.8); ctx.fillStyle = f.color; ctx.font = '700 15px ' + font; ctx.fillText(f.text, f.x, f.y); }
      ctx.globalAlpha = 1;
      if (state === 'playing' && combo >= 3) {
        ctx.fillStyle = accent2; ctx.textAlign = 'left';
        ctx.font = '700 13px ' + font; ctx.fillText('combo ×' + combo, 10, 20);
      }
      ctx.restore();

      if (flashA > 0) { ctx.fillStyle = 'rgba(255,80,80,' + flashA + ')'; ctx.fillRect(0, 0, W, H); }
      if (state === 'ready') drawOverlay(ctx, W, H, t('coinsName'), t('tapToStart'));
      if (state === 'over') drawOverlay(ctx, W, H, t('gameOver'), isRecord ? t('newRecord', { n: score }) : t('tapToRestart'));
    }

    // Sterowanie: koszyk podąża za palcem/myszą; tap/klik = start-restart;
    // strzałki (klawiatura, przez engine.onDir) przesuwają koszyk skokowo.
    function moveTo(clientX) {
      const rect = canvas.getBoundingClientRect();
      targetX = Math.max(bw / 2, Math.min(W - bw / 2, (clientX - rect.left) * (W / Math.max(1, rect.width))));
    }
    const tapish = () => { if (engine && engine.onTap) engine.onTap(); };
    const mDown = (e) => { moveTo(e.clientX); tapish(); };
    const mMove = (e) => { moveTo(e.clientX); };
    const tStart = (e) => { e.preventDefault(); const p = e.touches[0]; if (p) moveTo(p.clientX); tapish(); };
    const tMove = (e) => { e.preventDefault(); const p = e.touches[0]; if (p) moveTo(p.clientX); };
    canvas.addEventListener('mousedown', mDown);
    canvas.addEventListener('mousemove', mMove);
    canvas.addEventListener('touchstart', tStart, { passive: false });
    canvas.addEventListener('touchmove', tMove, { passive: false });

    engine = {
      stop() {
        canvas.removeEventListener('mousedown', mDown);
        canvas.removeEventListener('mousemove', mMove);
        canvas.removeEventListener('touchstart', tStart);
        canvas.removeEventListener('touchmove', tMove);
      },
      onTap() {
        if (state === 'ready') state = 'playing';
        else if (state === 'over' && Date.now() - diedAt > 400) reset();
      },
      onDir(d) {
        if (state === 'ready') state = 'playing';
        if (d === 'left') targetX = Math.max(bw / 2, targetX - W * 0.18);
        if (d === 'right') targetX = Math.min(W - bw / 2, targetX + W * 0.18);
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

  // ── Redstone (piaskownica obwodów) ────────────────────
  // 2D, widok z góry, inspirowane redstone z Minecrafta. Sygnał 0-15, zanika o 1
  // na komórkę przewodu. Pochodnia stoi NA Bloku i jest bramką NOT — gaśnie gdy
  // Blok jest zasilony skądinąd. WAŻNE: zwykły przewód NIGDY nie zasila Bloku
  // pochodni (patrz `direct` w relayInto, FAZA 2) — inaczej przewód, którym
  // pochodnia właśnie wysyła swój sygnał, natychmiast odbiłby go z powrotem
  // na jej własny Blok W TYM SAMYM ticku (migotanie z maksymalną częstotliwością;
  // sprawdzone empirycznie, 1-tickowy poślizg NIC tu nie chroni, bo to odbicie
  // o zerowym dystansie w obrębie jednej propagacji, nie pętla w czasie).
  // Odpowiada to realnej regule Minecrafta: "pochodnia nie jest zasilana przez
  // przewód, który sama zasila". To, czego przewód NIE MOŻE, mogą za to
  // Przekaźnik/Komparator dotykające Bloku pochodni WPROST (bez przewodu
  // pomiędzy) — są kierunkowe (czytają z przeciwnej strony niż wychodzą) i mają
  // własne opóźnienie, więc bezpiecznie ją odwracają — to jedyny sposób
  // budowania zegarów/pętli z pochodni w tym silniku (np. Pochodnia -wire->
  // wejście Przekaźnika, wyjście tego Przekaźnika dotyka z powrotem Bloku
  // Pochodni wprost). Symulacja tyka niezależnie od pętli rAF renderu
  // (setInterval) — inny rytm niż płynna kamera/wejście.
  const RS_TICK_MS = 100;
  const RS_REPEATER_DELAY = 1;   // ticki
  const RS_BUTTON_TICKS = 10;    // ~1s przy 10 tickach/s
  const RS_PISTON_MAX_PUSH = 12; // max długość łańcucha bloków do popchnięcia (jak w Minecrafcie)
  const RS_NOTE_FLASH_TICKS = 3;  // wizualny błysk Note Blocka po zagraniu (tylko render, nie logika)
  const RS_DENIED_FLASH_TICKS = 4; // czerwony błysk gdy stawianie/pochodnia odrzucone (zajęte pole)
  const RS_PISTON_ANIM_MS = 150;  // czas animacji wysuwania/chowania ramienia tłoka (tylko render, rAF, nie tick)
  const RS_MIN_SCALE = 14, RS_MAX_SCALE = 64; // px na komórkę
  const RS_ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const RS_DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // rotation 0=E,1=S,2=W,3=N (kierunek WYJŚCIA przekaźnika)
  const RS_WIRE_OFF = [74, 20, 20], RS_WIRE_ON = [255, 107, 26];
  // Redstone renderuje się ZAWSZE w kolorach motywu LifeXP (ciemny), niezależnie
  // od wybranego motywu apki (Apple/Gold) — jasne motywy dawały słaby/niewidoczny
  // kontrast dla ciemnych klocków. Reszta strony (toolbar, tło strony) nadal
  // podąża za globalnym motywem — to dotyczy tylko treści samego canvasu.
  const RS_BG = '#1e2029', RS_BORDER = '#2a2d3a', RS_TEXT2 = '#8a8fa8';
  // Tło/obramowanie Repeatera/Komparatora/Observera — celowo WYRAŹNIE jaśniejsze
  // niż RS_BG/RS_BORDER (które są prawie nie do odróżnienia od tła/siatki
  // canvasu), inaczej te trzy komponenty są ledwo widoczne, zwłaszcza przy
  // małym przybliżeniu — patrz zgłoszenie "niektóre bloki są ledwo widzialne".
  const RS_COMPONENT_BG = '#343850', RS_COMPONENT_BORDER = '#565c80';
  const RS_DENIED_COLOR = '#ff4d4d';

  let rsWorld = new Map();              // "x,y" -> {type, rotation?, on?} (ZAPISYWANE)
  let rsCamera = { x: 0, y: 0, scale: 28 }; // (ZAPISYWANE razem ze światem)
  let rsTool = 'select';
  let rsTick = 0;
  let rsTorchPoweredPrev = new Map();   // ulotne — stan WŁASNEJ komórki Pochodni z poprzedniego ticku
  let rsScheduledRepeaters = new Map(); // ulotne — key -> { dueTick }
  let rsRepeaterActiveNow = new Set();  // ulotne — przebudowywane co tick: Repeatery, których wyjście jest DOSTARCZANE w TYM ticku (do rsSensedPower — bezpośredni dotyk Repeater→Repeater/Comparator)
  let rsButtonActive = new Map();       // ulotne — key -> tick do którego przycisk aktywny
  let rsLastPower = new Map();          // ulotne, tylko do rysowania
  let rsScheduledComparators = new Map(); // ulotne — key -> { dueTick, strength } (przeliczane co tick, nie tylko raz)
  let rsComparatorOutputPrev = new Map(); // ulotne — ostatnia zastosowana siła wyjścia (do rysowania + sygnatur Observera + rsSensedPower)
  let rsScheduledObservers = new Map();    // ulotne — key -> { dueTick } (impuls jednorazowy, siła zawsze 15)
  let rsObserverPrevSig = new Map();       // ulotne — ostatnia sygnatura obserwowanej komórki (do wykrywania zmian)
  let rsObserverFiredAtTick = new Map();   // ulotne — key -> numer ticku ostatniego odpalenia (do sygnatury 'observer' — patrz rsCellSignature)
  let rsScheduledNotGates = new Map();     // ulotne — key -> { dueTick } (jak Repeater, ale odpala gdy WEJŚCIE jest ZGASZONE)
  let rsNotGateActiveNow = new Set();      // ulotne — przebudowywane co tick, jak rsRepeaterActiveNow
  let rsPistonPoweredPrev = new Map();     // ulotne — stan zasilenia tłoków z poprzedniego ticku (do wykrywania zbocza)
  let rsScheduledPistons = new Map();      // ulotne — key -> { dueTick, action: 'extend'|'retract' }
  let rsNoteBlockPoweredPrev = new Map();  // ulotne — stan zasilenia Note Blocków z poprzedniego ticku
  let rsNoteBlockPulse = new Map();        // ulotne — key -> tick do którego trwa wizualny błysk po zagraniu
  let rsAdderValue = new Map();            // ulotne — key -> ostatnia zsumowana wartość Signal Addera (do rysowania)
  let rsDeniedFlash = new Map();           // ulotne — key -> tick do którego trwa czerwony błysk "odrzucono"
  let rsPistonAnim = new Map();            // ulotne — key -> { from, extending, t0 } (animacja ramienia, tylko render)
  let rsPanelKey = null;                   // ulotne — klucz komórki z otwartym panelem ustawień ("select" na Repeater/Comparator)
  let rsAudioCtx = null;                   // leniwie tworzony przy pierwszym dźwięku (wymaga gestu użytkownika)
  let rsSimTimer = 0;
  let rsSaveT = 0;
  let rsW = 0, rsH = 0;

  const rsKey = (x, y) => x + ',' + y;
  const rsParseKey = (key) => { const p = key.split(','); return [parseInt(p[0], 10), parseInt(p[1], 10)]; };
  const rsNeighbors = (x, y) => RS_ORTHO.map(([dx, dy]) => [x + dx, y + dy]);
  const rsRepeaterOut = (x, y, rot) => { const d = RS_DIR[rot]; return [x + d[0], y + d[1]]; };
  const rsRepeaterIn = (x, y, rot) => { const d = RS_DIR[(rot + 2) % 4]; return [x + d[0], y + d[1]]; };
  // Aliasy ogólne — Comparator/Observer dzielą tę samą logikę kierunku co
  // Repeater (rsRepeaterOut/In zostają nietknięte, Repeater dalej ich używa
  // wprost). "Front" = kierunek wskazywany przez rotację, "Back" = przeciwny.
  const rsFrontOf = rsRepeaterOut;
  const rsBackOf = rsRepeaterIn;

  function rsLoadWorld() {
    rsWorld = new Map();
    rsCamera = { x: 0, y: 0, scale: 28 };
    try {
      const raw = localStorage.getItem('lifexp-redstone-world');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.cells)) rsWorld = new Map(parsed.cells);
        if (parsed && parsed.cam) rsCamera = { x: parsed.cam.x || 0, y: parsed.cam.y || 0, scale: parsed.cam.scale || 28 };
      }
    } catch (e) {}
    rsTick = 0;
    rsTorchPoweredPrev = new Map();
    rsScheduledRepeaters = new Map();
    rsRepeaterActiveNow = new Set();
    rsButtonActive = new Map();
    rsLastPower = new Map();
    rsScheduledComparators = new Map();
    rsComparatorOutputPrev = new Map();
    rsScheduledObservers = new Map();
    rsObserverPrevSig = new Map();
    rsObserverFiredAtTick = new Map();
    rsScheduledNotGates = new Map();
    rsNotGateActiveNow = new Set();
    rsPistonPoweredPrev = new Map();
    rsScheduledPistons = new Map();
    rsNoteBlockPoweredPrev = new Map();
    rsNoteBlockPulse = new Map();
    rsAdderValue = new Map();
    rsDeniedFlash = new Map();
    rsPistonAnim = new Map();
    rsPanelKey = null;
  }

  // Prosty syntezowany dźwięk (Web Audio, bez plików/bibliotek) — zakres i
  // częstotliwości jak w Minecrafcie: 25 wysokości (F#3..F#5), półton na krok.
  function rsPlayNote(pitch) {
    try {
      if (!rsAudioCtx) rsAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (rsAudioCtx.state === 'suspended') rsAudioCtx.resume();
      const freq = 185.00 * Math.pow(2, pitch / 12);
      const osc = rsAudioCtx.createOscillator();
      const gain = rsAudioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const now = rsAudioCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc.connect(gain).connect(rsAudioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {}
  }

  function rsSaveWorld() {
    try {
      localStorage.setItem('lifexp-redstone-world', JSON.stringify({
        v: 1, cells: Array.from(rsWorld.entries()), cam: rsCamera,
      }));
    } catch (e) {}
  }

  function rsScheduleSave() {
    clearTimeout(rsSaveT);
    rsSaveT = setTimeout(rsSaveWorld, 500);
  }

  function rsDefaultCell(tool) {
    if (tool === 'repeater') return { type: 'repeater', rotation: 0, delay: 1 };
    if (tool === 'comparator') return { type: 'comparator', rotation: 0, mode: 'compare' };
    if (tool === 'observer') return { type: 'observer', rotation: 0 };
    if (tool === 'not_gate') return { type: 'not_gate', rotation: 0 };
    if (tool === 'torch') return { type: 'torch', rotation: 0 };
    if (tool === 'piston' || tool === 'sticky_piston') return { type: tool, rotation: 0, extended: false };
    if (tool === 'noteblock') return { type: 'noteblock', pitch: 0 };
    if (tool === 'lever') return { type: 'lever', on: false };
    if (tool === 'sign') return { type: 'sign', text: '', separate: false };
    return { type: tool }; // block, wire, button, lamp, meter, adder
  }

  function rsUpdateBestFromSize() {
    if (rsWorld.size > getBest('redstone')) {
      setBest('redstone', rsWorld.size);
      setBestLabel(rsWorld.size);
    }
  }

  // Dotknięcie komórki (cx,cy) — zachowanie zależy od wybranego narzędzia:
  // - "select": na Repeaterze/Komparatorze otwiera panel ustawień (obrót +
  //   opóźnienie albo tryb — patrz rsOpenPanel/rsRenderPanel) zamiast obracać
  //   od razu, bo te dwa komponenty mają dodatkowe parametry poza obrotem.
  //   Na Observerze/NOT Gate/Pochodni/tłoku (tłok tylko gdy NIE jest
  //   wysunięty — obracanie w trakcie pchania zostawiłoby popchnięte bloki w
  //   niespójnym stanie) nadal obraca wprost — nie mają nic więcej do
  //   ustawienia. Przełącza dźwignię, naciska przycisk, zmienia wysokość
  //   tonu Note Blocka (z podglądem dźwięku od razu).
  // - "eraser": usuwa cokolwiek stoi na polu. Na Głowicy Tłoka (Piston Head)
  //   chowa najpierw właściciela (żeby nie zostawić osieroconego "wysuniętego"
  //   tłoka bez jego głowicy).
  // - inne narzędzie (w tym "torch" — Pochodnia jest teraz samodzielnym
  //   klockiem jak Dźwignia, stawianym jednym tapnięciem na PUSTYM polu,
  //   BEZ wymogu istniejącego Bloku): stawia nowy klocek na PUSTYM polu
  //   (zajęte = nic — próba postawienia na zajętym polu daje krótki czerwony
  //   błysk "odrzucono", żeby było jasne, że coś tam już jest, a nie że
  //   stawianie klocków nie działa).
  function rsHandleTap(cx, cy) {
    const key = rsKey(cx, cy);
    const cell = rsWorld.get(key);
    if (rsTool === 'select') {
      if (!cell) { rsClosePanel(); return; }
      if (cell.type === 'repeater' || cell.type === 'comparator' || cell.type === 'sign') { rsOpenPanel(key); return; }
      else if (cell.type === 'observer' || cell.type === 'not_gate' || cell.type === 'torch') cell.rotation = (cell.rotation + 1) % 4;
      else if ((cell.type === 'piston' || cell.type === 'sticky_piston') && !cell.extended) cell.rotation = (cell.rotation + 1) % 4;
      else if (cell.type === 'noteblock') { cell.pitch = (cell.pitch + 1) % 25; rsPlayNote(cell.pitch); }
      else if (cell.type === 'lever') cell.on = !cell.on;
      else if (cell.type === 'button') rsButtonActive.set(key, rsTick + RS_BUTTON_TICKS);
      else return;
    } else if (rsTool === 'eraser') {
      if (!cell) return;
      if (cell.type === 'piston_head') {
        const owner = rsWorld.get(cell.owner);
        if (owner) rsPistonRetract(cell.owner, owner); // usuwa też samą głowicę
        else rsWorld.delete(key); // osierocona głowica (nie powinno się zdarzyć) — po prostu usuń
      } else {
        rsWorld.delete(key);
      }
      if (key === rsPanelKey) rsClosePanel();
      rsScheduledRepeaters.delete(key);
      rsButtonActive.delete(key);
      rsScheduledComparators.delete(key);
      rsComparatorOutputPrev.delete(key);
      rsScheduledObservers.delete(key);
      rsObserverPrevSig.delete(key);
      rsObserverFiredAtTick.delete(key);
      rsScheduledNotGates.delete(key);
      rsTorchPoweredPrev.delete(key);
      rsAdderValue.delete(key);
      rsPistonPoweredPrev.delete(key);
      rsScheduledPistons.delete(key);
      rsNoteBlockPoweredPrev.delete(key);
      rsNoteBlockPulse.delete(key);
    } else {
      if (cell) { rsDeniedFlash.set(key, rsTick + RS_DENIED_FLASH_TICKS); return; }
      rsWorld.set(key, rsDefaultCell(rsTool));
    }
    rsUpdateBestFromSize();
    rsScheduleSave();
  }

  // Ile mocy "widzi" komponent patrzący NA komórkę `key` — albo przekazany
  // sygnał z mapy `power` (przewód/blok/lampa/Note Block), albo, jeśli ta
  // komórka SAMA jest źródłem (dźwignia/przycisk/Pochodnia), jej własna moc
  // wprost — bo źródło nie zasila SAMEGO SIEBIE w mapie `power` (relayInto
  // dostaje tylko jego SĄSIADÓW), a mimo to w prawdziwym Minecrafcie
  // przekaźnik/komparator stojący TUŻ PRZY źródle (bez przewodu pomiędzy) i
  // tak je odczytuje. Repeater/Comparator/Observer/Piston/NOT Gate/Głowica
  // Tłoka celowo zwracają TU zawsze 0 — są kierunkowe/strukturalne, nie
  // ogólne źródła czytelne "z dowolnej strony dotyku" (patrz rsSensedPower
  // niżej, która dodaje poprawną, KIERUNKOWĄ obsługę bezpośrednio
  // dotykającego Repeatera/Komparatora/NOT Gate). Meter/Adder też zwracają 0
  // — to czyste "sondy", nie mogą nic zasilać (wymóg: nie przewodzą dalej).
  function rsCellPowerFor(key, power, torchLitNow) {
    const c = rsWorld.get(key);
    if (!c) return power.get(key) || 0;
    if (c.type === 'lever') return c.on ? 15 : 0;
    if (c.type === 'button') return (rsButtonActive.get(key) || 0) > rsTick ? 15 : 0;
    if (c.type === 'torch') return torchLitNow.get(key) ? 15 : 0;
    if (c.type === 'wire' || c.type === 'block' || c.type === 'noteblock' || c.type === 'lamp') return power.get(key) || 0;
    return 0;
  }

  // Rozszerza rsCellPowerFor o poprawną obsługę BEZPOŚREDNIO dotykającego
  // Repeatera/Komparatora/NOT Gate (bez przewodu pomiędzy) — ich wyjście jest
  // kierunkowe (wychodzi TYLKO z frontu), więc liczy się TYLKO gdy ich front
  // wskazuje dokładnie na `myKey` (czyli na TEGO, kto pyta); dotyk z innej
  // strony (bok/tył/przypadkowe sąsiedztwo) nic nie daje — dokładnie jak w
  // Minecrafcie. Bez tego direct chaining Repeater→Repeater/Komparator w
  // ogóle by nie działał (rsCellPowerFor sam w sobie zwraca dla nich 0), a
  // wcześniej (błąd) to samo dawało się "wyczuć" przez przypadkowy wyciek do
  // wspólnej mapy `power` z DOWOLNEJ strony — stąd zgłoszenie "komparator i
  // przekaźnik są zasilane, choć nie powinny być". Używana wszędzie tam,
  // gdzie komponent czyta konkretnego SĄSIADA na potrzeby własnej decyzji
  // (Repeater/Comparator/NOT Gate/Piston/Adder) — NIE w ogólnej propagacji
  // przewodu (FAZA 2, ta ma własną, symetryczną logikę).
  function rsSensedPower(neighborKey, myKey, power, torchLitNow) {
    const nc = rsWorld.get(neighborKey);
    if (nc && (nc.type === 'repeater' || nc.type === 'comparator' || nc.type === 'not_gate')) {
      const [nx, ny] = rsParseKey(neighborKey);
      if (rsKey(...rsFrontOf(nx, ny, nc.rotation)) !== myKey) return 0;
      if (nc.type === 'repeater') return rsRepeaterActiveNow.has(neighborKey) ? 15 : 0;
      if (nc.type === 'not_gate') return rsNotGateActiveNow.has(neighborKey) ? 15 : 0;
      return rsComparatorOutputPrev.get(neighborKey) || 0;
    }
    return rsCellPowerFor(neighborKey, power, torchLitNow);
  }

  // Sygnatura "co widać z zewnątrz" dla dowolnej komórki w TYM ticku — używana
  // przez Observer do wykrywania zmian. Rozszerzalna: kolejne typy komórek
  // (czujniki, drzwi, tłoki, Note Block...) dopisują tu swój przypadek.
  function rsCellSignature(key, power, torchLitNow) {
    const c = rsWorld.get(key);
    if (!c) return 'empty';
    switch (c.type) {
      case 'wire': return 'wire:' + (power.get(key) || 0);
      case 'block': return 'block:plain';
      case 'torch': return 'torch:' + c.rotation + ':' + (torchLitNow.get(key) ? 'lit' : 'off');
      case 'lever': return 'lever:' + (c.on ? 1 : 0);
      case 'button': return 'button:' + ((rsButtonActive.get(key) || 0) > rsTick ? 1 : 0);
      // "Numer ticku ostatniego odpalenia" zamiast prostego on/off — inaczej
      // FAZA 1 (dostarcza i OD RAZU czyści zaplanowany impuls) i FAZA 5
      // (sprawdza sygnaturę PÓŹNIEJ w tym samym ticku) nigdy nie zdążyłyby się
      // "minąć" na wspólnej wartości "1" — a to właśnie uniemożliwiało
      // działanie zegara z dwóch Observerów patrzących na siebie.
      case 'observer': return 'observer:' + c.rotation + ':' + (rsObserverFiredAtTick.get(key) || 0);
      // Przybliżenie: "czy przekaźnik właśnie widzi aktywne wejście" (ma
      // zaplanowane odpalenie) — wystarczające do wykrywania przejść on/off.
      case 'repeater': return 'repeater:' + c.rotation + ':' + (rsScheduledRepeaters.has(key) ? 1 : 0);
      case 'comparator': return 'comparator:' + c.rotation + ':' + c.mode + ':' + (rsComparatorOutputPrev.get(key) || 0);
      case 'not_gate': return 'not_gate:' + c.rotation + ':' + (rsScheduledNotGates.has(key) ? 1 : 0);
      case 'lamp': return 'lamp:' + ((power.get(key) || 0) > 0 ? 1 : 0);
      case 'piston': case 'sticky_piston': return c.type + ':' + c.rotation + ':' + (c.extended ? 1 : 0);
      case 'noteblock': return 'noteblock:' + c.pitch + ':' + (rsNoteBlockPoweredPrev.get(key) ? 1 : 0);
      case 'meter': return 'meter:' + (power.get(key) || 0);
      case 'adder': return 'adder:' + (rsAdderValue.get(key) || 0);
      default: return c.type;
    }
  }

  // Krótki syntezowany "stuk" tłoka (ten sam leniwy rsAudioCtx co rsPlayNote)
  // — opadający ton przy wysuwaniu, rosnący przy chowaniu, żeby oba kierunki
  // brzmiały wyraźnie inaczej.
  function rsPlayPistonSound(extending) {
    try {
      if (!rsAudioCtx) rsAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (rsAudioCtx.state === 'suspended') rsAudioCtx.resume();
      const now = rsAudioCtx.currentTime;
      const osc = rsAudioCtx.createOscillator();
      const gain = rsAudioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(extending ? 90 : 60, now);
      osc.frequency.exponentialRampToValueAtTime(extending ? 45 : 130, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.connect(gain).connect(rsAudioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {}
  }

  // Postęp animacji ramienia tłoka 0→1 (schowany→wysunięty), TYLKO do
  // rysowania — niezależny od ticku symulacji (rAF płynny, tick 100ms nie
  // jest). rsPistonAnim trzyma znacznik czasu ustawiony w rsPistonExtend/
  // Retract; po zakończeniu animacji wpis jest sprzątany, a funkcja wraca do
  // zwracania samego (statycznego) `cell.extended`.
  function rsPistonAnimProgress(key, cell) {
    const anim = rsPistonAnim.get(key);
    if (!anim) return cell.extended ? 1 : 0;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = Math.min(1, (now - anim.t0) / RS_PISTON_ANIM_MS);
    if (t >= 1) { rsPistonAnim.delete(key); return anim.extending ? 1 : 0; }
    return anim.extending ? t : (1 - t);
  }

  // Solidne, przesuwalne klocki — jak w Minecrafcie (Note Block/Observer/
  // lampy SĄ pushable tam, drobne "przyczepki" typu przewód/dźwignia/
  // przekaźnik NIE są, tylko odpadają). Tłok (nie-wysunięty) też się przesuwa.
  const RS_PISTON_PUSHABLE = new Set(['block', 'noteblock', 'observer', 'lamp', 'meter', 'adder']);

  // Wysuwa tłok (o kluczu `key`, komórka `cell`) — jeśli już wysunięty, nic
  // nie robi (idempotentne, jak w Minecrafcie). Szuka łańcucha kolejnych
  // przesuwalnych klocków (RS_PISTON_PUSHABLE, plus nie-wysunięte tłoki)
  // przed sobą w kierunku pchania. Łańcuch kończy się na: pustym polu (da się
  // pchnąć), "przyczepce" typu przewód/Repeater/Comparator/dźwignia/przycisk/
  // NOT Gate/Pochodnia (NIE blokuje — po prostu odpada/znika, jak redstone
  // dust w Minecrafcie), Głowicy innego tłoka LUB już wysuniętym tłoku (te
  // dwa BLOKUJĄ całkowicie — nie da się przez nie pchać), albo za długim
  // łańcuchu (> RS_PISTON_MAX_PUSH, też blokuje). Pole tuż przed tłokiem
  // (zawsze wolne po przesunięciu łańcucha / usunięciu przyczepki) dostaje
  // realną komórkę 'piston_head' — bez tego głowica była czystą dekoracją
  // rysowaną NA WIERZCHU dowolnego klocka, który ktoś tam postawił w
  // międzyczasie (efekt "stackowania"), i inny tłok mógł swobodnie pchać
  // blok prosto w nią.
  function rsPistonExtend(key, cell) {
    if (cell.extended) return;
    const [x, y] = rsParseKey(key);
    const d = RS_DIR[cell.rotation];
    const chain = [];
    let cx = x + d[0], cy = y + d[1];
    while (true) {
      const there = rsWorld.get(rsKey(cx, cy));
      if (!there) break; // puste pole — koniec łańcucha, da się pchnąć
      if (there.type === 'piston_head') return; // głowica innego tłoka — zablokowane
      if (there.type === 'piston' || there.type === 'sticky_piston') {
        if (there.extended) return; // wysunięty tłok — zablokowane
        chain.push([cx, cy]);
      } else if (RS_PISTON_PUSHABLE.has(there.type)) {
        chain.push([cx, cy]);
      } else {
        break; // "przyczepka" (przewód, Repeater, Comparator, NOT Gate, dźwignia, przycisk, Pochodnia) — nie blokuje, tu kończy się łańcuch
      }
      if (chain.length > RS_PISTON_MAX_PUSH) return; // za długi łańcuch — zablokowane
      cx += d[0]; cy += d[1];
    }
    // Jeśli łańcuch zatrzymał się na "przyczepce" (nie pustym polu), usuń ją
    // — właśnie tam wyląduje Głowica.
    const stopKey = rsKey(cx, cy);
    if (rsWorld.has(stopKey)) rsWorld.delete(stopKey);
    // Przesuń łańcuch OD KOŃCA (żeby nie nadpisać jeszcze nieprzeniesionych pól).
    for (let i = chain.length - 1; i >= 0; i--) {
      const [bx, by] = chain[i];
      const data = rsWorld.get(rsKey(bx, by));
      rsWorld.delete(rsKey(bx, by));
      rsWorld.set(rsKey(bx + d[0], by + d[1]), data);
    }
    rsWorld.set(rsKey(x + d[0], y + d[1]), { type: 'piston_head', owner: key });
    cell.extended = true;
    rsPistonAnim.set(key, { extending: true, t0: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
    rsPlayPistonSound(true);
  }

  // Chowa tłok — usuwa najpierw jego Głowicę (patrz rsPistonExtend). Zwykły
  // tłok nic więcej nie robi (popchnięty blok zostaje tam, gdzie jest — jak w
  // Minecrafcie). Sticky Piston dodatkowo ciągnie z powrotem JEDEN blok, jeśli
  // stoi bezpośrednio "przy głowicy" (2 pola przed tłokiem — pole 1 pole przed
  // tłokiem jest właśnie zwolnione przez usunięcie Głowicy, to tam "wraca"
  // razem z przyciągniętym blokiem).
  function rsPistonRetract(key, cell) {
    if (!cell.extended) return;
    cell.extended = false;
    const [x, y] = rsParseKey(key);
    const d = RS_DIR[cell.rotation];
    const headKey = rsKey(x + d[0], y + d[1]);
    rsWorld.delete(headKey);
    rsPistonAnim.set(key, { extending: false, t0: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
    rsPlayPistonSound(false);
    if (cell.type !== 'sticky_piston') return;
    const attachedKey = rsKey(x + d[0] * 2, y + d[1] * 2);
    const attached = rsWorld.get(attachedKey);
    if (attached && attached.type === 'block') {
      rsWorld.delete(attachedKey);
      rsWorld.set(headKey, attached);
    }
  }

  // ── Symulacja (setInterval, ~10 ticków/s, niezależna od rAF renderu) ──
  // Kolejność faz jest CELOWO stała i deterministyczna (nie zmieniać kolejności
  // przy dopisywaniu kolejnych komponentów — kolejne fazy czytają wyniki
  // poprzednich w tym samym ticku):
  // 1. źródła sygnału  2. propagacja  3. Repeatery/NOT Gate  4. Komparatory
  // 5. Observers  6. Pistony + Note Block + Adder  8. aktualizacja Pochodni
  // 9. render (poza tą funkcją)
  // (Faza 7 "czujniki" celowo pominięta — poza zakresem tej rundy prac.)
  function rsTick_() {
    rsTick++;

    // FAZA 1: źródła sygnału.
    // 1a) Kierunkowe odpalenia zaplanowane w POPRZEDNICH tickach (Repeater,
    //     NOT Gate, Komparator, Observer) — każdy niesie własną siłę sygnału
    //     (Repeater/NOT Gate/Observer zawsze 15, Komparator to co właśnie
    //     policzył). rsRepeaterActiveNow/rsNotGateActiveNow przebudowane od
    //     zera KAŻDY tick — zawierają WYŁĄCZNIE te, których wyjście jest
    //     dostarczane W TYM ticku (do rsSensedPower — bezpośredni dotyk
    //     Repeater/NOT Gate → Repeater/Comparator/NOT Gate/Pochodnia/Tłok).
    const directedInjections = []; // [{ pos, strength }]
    rsRepeaterActiveNow = new Set();
    for (const [key, sched] of rsScheduledRepeaters) {
      if (sched.dueTick <= rsTick) {
        const cell = rsWorld.get(key);
        if (cell && cell.type === 'repeater') {
          const [x, y] = rsParseKey(key);
          directedInjections.push({ pos: rsKey(...rsFrontOf(x, y, cell.rotation)), strength: 15 });
          rsRepeaterActiveNow.add(key);
        }
        rsScheduledRepeaters.delete(key);
      }
    }
    rsNotGateActiveNow = new Set();
    for (const [key, sched] of rsScheduledNotGates) {
      if (sched.dueTick <= rsTick) {
        const cell = rsWorld.get(key);
        if (cell && cell.type === 'not_gate') {
          const [x, y] = rsParseKey(key);
          directedInjections.push({ pos: rsKey(...rsFrontOf(x, y, cell.rotation)), strength: 15 });
          rsNotGateActiveNow.add(key);
        }
        rsScheduledNotGates.delete(key);
      }
    }
    for (const [key, sched] of rsScheduledComparators) {
      if (sched.dueTick <= rsTick) {
        const cell = rsWorld.get(key);
        if (cell && cell.type === 'comparator') {
          const [x, y] = rsParseKey(key);
          directedInjections.push({ pos: rsKey(...rsFrontOf(x, y, cell.rotation)), strength: sched.strength });
        }
        rsComparatorOutputPrev.set(key, sched.strength);
        rsScheduledComparators.delete(key);
      }
    }
    for (const [key, sched] of rsScheduledObservers) {
      if (sched.dueTick <= rsTick) {
        const cell = rsWorld.get(key);
        if (cell && cell.type === 'observer') {
          const [x, y] = rsParseKey(key);
          directedInjections.push({ pos: rsKey(...rsBackOf(x, y, cell.rotation)), strength: 15 });
          rsObserverFiredAtTick.set(key, rsTick);
        }
        rsScheduledObservers.delete(key);
      }
    }
    // 1c) Tłoki zaplanowane w POPRZEDNIM ticku faktycznie się teraz
    //     wysuwają/chowają (przesunięcie bloków w rsWorld) — PRZED propagacją,
    //     żeby sygnał w tym ticku widział już nowy układ siatki.
    for (const [key, sched] of rsScheduledPistons) {
      if (sched.dueTick <= rsTick) {
        const cell = rsWorld.get(key);
        if (cell && (cell.type === 'piston' || cell.type === 'sticky_piston')) {
          if (sched.action === 'extend') rsPistonExtend(key, cell);
          else rsPistonRetract(key, cell);
        }
        rsScheduledPistons.delete(key);
      }
    }
    // 1b) Źródła wszechkierunkowe: Pochodnie (wg stanu WŁASNEJ komórki z
    //     POPRZEDNIEGO ticku — to jest ten 1-tickowy lag łamiący pętlę
    //     zwrotną), dźwignie włączone, przyciski wciąż aktywne.
    const omniSources = [];
    const torchLitNow = new Map(); // klucz Pochodni -> czy świeci W TYM ticku (do sygnatur Observera)
    for (const [key, cell] of rsWorld) {
      if (cell.type === 'torch') {
        const lit = !rsTorchPoweredPrev.get(key);
        torchLitNow.set(key, lit);
        if (lit) omniSources.push(key);
      }
      else if (cell.type === 'lever' && cell.on) omniSources.push(key);
      else if (cell.type === 'button' && (rsButtonActive.get(key) || 0) > rsTick) omniSources.push(key);
    }

    // FAZA 2: propagacja — wielo-źródłowy BFS z zanikiem (kubełki wg siły
    // 15→1). Każda komórka przyjmuje tylko NAJSILNIEJSZY sygnał jaki do niej
    // dotarł i to wystarczy — klasyczne "shortest path z zanikiem", jeden
    // przebieg, bez pętli. Dalej propagują TYLKO przewody (wire) — blok/
    // lampa/przekaźnik/komparator/dźwignia/przycisk to zawsze ślepy zaułek.
    const power = new Map();
    const buckets = Array.from({ length: 16 }, () => []);
    // `direct` = true tylko dla wywołań z omniSources/directedInjections
    // poniżej (bezpośredni dotyk: dźwignia/przycisk/inna Pochodnia/wyjście
    // przekaźnika/komparatora/NOT Gate). Pochodnia przyjmuje zasilenie TYLKO
    // gdy direct === true — NIGDY z ogólnej propagacji przewodu (pętla niżej
    // wywołuje relayInto bez trzeciego argumentu = false). Powód: przewód
    // zasilany PRZEZ Pochodnię zawsze jest też jej sąsiadem (Pochodnia emituje
    // WSZECHKIERUNKOWO, także na własne "plecy"), więc zwykła propagacja
    // natychmiast odbiłaby jej własny sygnał z powrotem na jej WŁASNĄ komórkę
    // W TYM SAMYM ticku (migotanie z maksymalną częstotliwością, niezależnie
    // od opóźnień) — to nie jest pętla PRZEZ inne komponenty, tylko
    // bezpośrednie odbicie o dystansie zero, którego nie da się bezpiecznie
    // ominąć samym 1-tickowym poślizgiem. Odpowiada realnej regule
    // Minecrafta: "pochodnia nie jest zasilana przez przewód, który sama
    // zasila". Przekaźnik/Komparator/NOT Gate NIE mają tego problemu — są
    // kierunkowe (czytają wejście z przeciwnej strony niż wyjście) i mają
    // własne opóźnienie, więc mogą bezpiecznie odwracać Pochodnię, do której
    // dotykają wprost — to jedyny sposób budowania zegarów/pętli z Pochodni w
    // tym silniku (przewód sam z siebie nie może).
    //
    // Ten sam `!direct` guard blokuje też ogólną propagację (nie bezpośrednie
    // directedInjections/omniSources) na Repeaterze/Komparatorze/Observerze/
    // Tłoku/Głowicy Tłoka/NOT Gate — to NIE jest ta sama ochrona co wyżej
    // (te komponenty nie emitują wszechkierunkowo, więc nie ma ryzyka
    // odbicia o zerowym dystansie), tylko zamknięcie osobnego, empirycznie
    // znalezionego wycieku: bez tego dowolny przewód dotykający Repeatera/
    // Komparatora z KTÓREJKOLWIEK strony (nie tylko od wejścia) zostawiał w
    // `power` wartość na jego WŁASNEJ komórce, którą inny, sąsiedni komponent
    // mógł potem błędnie odczytać jako "ten Repeater/Komparator jest
    // zasilony" — stąd zgłoszenie "komparator/przekaźnik są zasilane/działają
    // bezprzewodowo, choć nie powinny być". rsCellPowerFor i tak zwraca dla
    // nich zawsze 0 (patrz tam), więc ten guard jest tu drugą linią obrony —
    // trzyma `power` dla tych komórek czyste, więc żaden przyszły kod czytający
    // je wprost (z pominięciem rsCellPowerFor) nie złapie tego samego wycieku.
    const NON_CONDUCTIVE = new Set(['repeater', 'comparator', 'observer', 'piston', 'sticky_piston', 'piston_head', 'not_gate', 'sign']);
    const relayInto = (pos, level, direct) => {
      if (level <= 0) return;
      const c = rsWorld.get(pos);
      if (!c) return;
      if (!direct && (c.type === 'torch' || NON_CONDUCTIVE.has(c.type))) return;
      if ((power.get(pos) || 0) >= level) return;
      power.set(pos, level);
      if (c.type === 'wire') buckets[level].push(pos);
    };
    for (const key of omniSources) {
      const [x, y] = rsParseKey(key);
      for (const [nx, ny] of rsNeighbors(x, y)) relayInto(rsKey(nx, ny), 15, true);
    }
    for (const inj of directedInjections) relayInto(inj.pos, inj.strength, true);
    for (let lvl = 15; lvl >= 1; lvl--) {
      for (const pos of buckets[lvl]) {
        if (power.get(pos) !== lvl) continue; // wpis nieaktualny, ktoś już nadpisał mocniejszym
        const [x, y] = rsParseKey(pos);
        for (const [nx, ny] of rsNeighbors(x, y)) relayInto(rsKey(nx, ny), lvl - 1, false);
      }
    }

    // FAZA 3: Repeatery/NOT Gate — sprawdź TYLKO pole od strony wejścia
    // (rotation+180°), przez rsSensedPower (obsługuje też bezpośrednio
    // dotykający Repeater/Komparator/NOT Gate, nie tylko przewód/dźwignię/
    // Pochodnię) — ta jednostronność daje efekt diody. Repeater: jeśli
    // zasilone i jeszcze nic nie zaplanowano, zaplanuj wyjście za
    // `cell.delay` ticków (1-4, panel ustawień). NOT Gate: dokładnie
    // odwrotnie — zaplanuj wyjście (15) gdy wejście jest ZGASZONE, zawsze z
    // 1-tickowym opóźnieniem (bez regulacji, prostota — to bramka logiczna,
    // nie licznik czasu).
    for (const [key, cell] of rsWorld) {
      if (cell.type !== 'repeater') continue;
      const [x, y] = rsParseKey(key);
      const inKey = rsKey(...rsBackOf(x, y, cell.rotation));
      if (rsSensedPower(inKey, key, power, torchLitNow) > 0 && !rsScheduledRepeaters.has(key)) {
        rsScheduledRepeaters.set(key, { dueTick: rsTick + (cell.delay || 1) });
      }
    }
    for (const [key, cell] of rsWorld) {
      if (cell.type !== 'not_gate') continue;
      const [x, y] = rsParseKey(key);
      const inKey = rsKey(...rsBackOf(x, y, cell.rotation));
      if (rsSensedPower(inKey, key, power, torchLitNow) === 0 && !rsScheduledNotGates.has(key)) {
        rsScheduledNotGates.set(key, { dueTick: rsTick + 1 });
      }
    }

    // FAZA 4: Komparatory — główne wejście (od tyłu wg rotacji) i dwa boczne
    // (prostopadłe), przez rsSensedPower. Tryb "compare": przepuszcza główny
    // sygnał, chyba że boczny jest SILNIEJSZY — wtedy wyjście 0. Tryb
    // "subtract": wyjście = główny minus najsilniejszy boczny (min. 0). W
    // przeciwieństwie do przekaźnika PRZELICZAMY co tick bezwarunkowo (wynik
    // może się zmieniać płynnie, nie tylko włącz/wyłącz) — nadpisujemy
    // zaplanowane wyjście, więc zawsze niesie NAJŚWIEŻSZĄ wartość z
    // 1-tickowym opóźnieniem.
    for (const [key, cell] of rsWorld) {
      if (cell.type !== 'comparator') continue;
      const [x, y] = rsParseKey(key);
      const mainKey = rsKey(...rsBackOf(x, y, cell.rotation));
      const sideA = RS_DIR[(cell.rotation + 1) % 4];
      const sideB = RS_DIR[(cell.rotation + 3) % 4];
      const main = rsSensedPower(mainKey, key, power, torchLitNow);
      const sideMax = Math.max(
        rsSensedPower(rsKey(x + sideA[0], y + sideA[1]), key, power, torchLitNow),
        rsSensedPower(rsKey(x + sideB[0], y + sideB[1]), key, power, torchLitNow)
      );
      const out = cell.mode === 'subtract' ? Math.max(0, main - sideMax) : (main >= sideMax ? main : 0);
      rsScheduledComparators.set(key, { dueTick: rsTick + RS_REPEATER_DELAY, strength: out });
    }

    // FAZA 5: Observers — wykrywają zmianę sygnatury obserwowanej komórki
    // ("z przodu", wg rotacji) względem poprzedniego ticku i strzelają impuls
    // DOKŁADNIE 1-tickowy, jednorazowo (nie na okrągło jak przekaźnik).
    // Brak warunku ".has()" jest CELOWY — pierwsze porównanie świeżo
    // postawionego Observera (prevSig jeszcze nieustawione) też liczy się
    // jako "zmiana" i odpala raz od razu, jak w Minecrafcie (Observer pulsuje
    // przy postawieniu) — to właśnie pozwala dwóm Observerom patrzącym na
    // siebie same wystartować w oscylację, zamiast utknąć na zawsze w 0/0.
    for (const [key, cell] of rsWorld) {
      if (cell.type !== 'observer') continue;
      const [x, y] = rsParseKey(key);
      const watchKey = rsKey(...rsFrontOf(x, y, cell.rotation));
      const sig = rsCellSignature(watchKey, power, torchLitNow);
      if (rsObserverPrevSig.get(key) !== sig) {
        rsScheduledObservers.set(key, { dueTick: rsTick + RS_REPEATER_DELAY });
      }
      rsObserverPrevSig.set(key, sig);
    }

    // FAZA 6: Pistony + Note Block + Adder.
    // Tłoki: aktywują się zasilone z DOWOLNEJ strony OPRÓCZ frontu (jak w
    // Minecrafcie — zasilenie z frontu nie aktywuje, inaczej tłok
    // wyzwoliłby się od razu tym, co właśnie pchnął), przez rsSensedPower
    // (więc też przez bezpośrednio dotykający Repeater/Komparator/NOT Gate).
    // Reagują na ZBOCZE (nie-zasilony->zasilony = wysunięcie, odwrotnie =
    // schowanie) z tym samym 1-tickowym opóźnieniem co reszta komponentów
    // kierunkowych — samo przesunięcie bloków wykonuje się na POCZĄTKU
    // kolejnego ticku (FAZA 1c).
    const nextPistonPowered = new Map();
    for (const [key, cell] of rsWorld) {
      if (cell.type !== 'piston' && cell.type !== 'sticky_piston') continue;
      const [x, y] = rsParseKey(key);
      const frontKey = rsKey(...rsFrontOf(x, y, cell.rotation));
      let poweredNow = false;
      for (const [nx, ny] of rsNeighbors(x, y)) {
        const nk = rsKey(nx, ny);
        if (nk === frontKey) continue;
        if (rsSensedPower(nk, key, power, torchLitNow) > 0) { poweredNow = true; break; }
      }
      nextPistonPowered.set(key, poweredNow);
      const wasPowered = rsPistonPoweredPrev.get(key) || false;
      if (poweredNow && !wasPowered) rsScheduledPistons.set(key, { dueTick: rsTick + RS_REPEATER_DELAY, action: 'extend' });
      else if (!poweredNow && wasPowered) rsScheduledPistons.set(key, { dueTick: rsTick + RS_REPEATER_DELAY, action: 'retract' });
    }
    rsPistonPoweredPrev = nextPistonPowered;

    // Note Block: niekierunkowy (zasilenie z DOWOLNEJ sąsiedniej strony, jak
    // Lampa), gra dźwięk na ZBOCZU nie-zasilony->zasilony — jednorazowo, nie
    // na okrągło przy trzymanym sygnale (jak Observer).
    const nextNoteBlockPowered = new Map();
    for (const [key, cell] of rsWorld) {
      if (cell.type !== 'noteblock') continue;
      const poweredNow = (power.get(key) || 0) > 0;
      nextNoteBlockPowered.set(key, poweredNow);
      if (poweredNow && !(rsNoteBlockPoweredPrev.get(key) || false)) {
        rsPlayNote(cell.pitch);
        rsNoteBlockPulse.set(key, rsTick + RS_NOTE_FLASH_TICKS);
      }
    }
    rsNoteBlockPoweredPrev = nextNoteBlockPowered;

    // Signal Adder: bierna sonda, sumuje moc SENSOWANĄ z KAŻDEJ z 4 stron
    // osobno (rsSensedPower, żeby liczyć też bezpośrednio dotykający
    // Repeater/Komparator/NOT Gate, nie tylko przewód) — inaczej niż Meter
    // (które po prostu czyta wspólne `power`, patrz rsDrawMeter), bo `power`
    // trzyma tylko JEDNĄ (najsilniejszą) wartość na komórkę, nie rozbicie
    // per-strona. Signal Meter nie potrzebuje tu nic — czyta rsLastPower
    // bezpośrednio przy rysowaniu, dokładnie jak Lampa.
    const nextAdderValue = new Map();
    for (const [key, cell] of rsWorld) {
      if (cell.type !== 'adder') continue;
      const [x, y] = rsParseKey(key);
      let sum = 0;
      for (const [nx, ny] of rsNeighbors(x, y)) sum += rsSensedPower(rsKey(nx, ny), key, power, torchLitNow);
      nextAdderValue.set(key, sum);
    }
    rsAdderValue = nextAdderValue;

    // FAZA 8: aktualizacja Pochodni — zapisz stan zasilenia ich WŁASNEJ
    // komórki z TEGO ticku prosto z mapy `power` (relayInto, FAZA 2, `direct`
    // już zagwarantował, że mogła wzrosnąć TYLKO przez bezpośredni dotyk —
    // zwykły przewód nigdy tu nic nie wpisał). Użyje tego dopiero NASTĘPNY
    // tick przy sprawdzaniu czy świecić.
    const nextTorchPowered = new Map();
    for (const [key, cell] of rsWorld) {
      if (cell.type !== 'torch') continue;
      nextTorchPowered.set(key, (power.get(key) || 0) > 0);
    }
    rsTorchPoweredPrev = nextTorchPowered;
    rsLastPower = power; // tylko do rysowania
  }

  // ── Kamera / gesty (nic podobnego nie ma jeszcze w kodzie — od zera) ──
  function rsWorldToScreen(wx, wy) {
    return {
      sx: rsW / 2 + (wx - rsCamera.x) * rsCamera.scale,
      sy: rsH / 2 + (wy - rsCamera.y) * rsCamera.scale,
    };
  }

  function rsBindGestures(canvas) {
    let mode = null; // 'pan' | 'pinch' | null
    let startX = 0, startY = 0, startCamX = 0, startCamY = 0, moved = false;
    let pinchStartDist = 0, pinchStartScale = 0;

    const pointOf = (e) => { const p = e.touches ? e.touches[0] : e; return { x: p.clientX, y: p.clientY }; };
    const dist2 = (t0, t1) => Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const clampScale = (s) => Math.max(RS_MIN_SCALE, Math.min(RS_MAX_SCALE, s));

    function onDown(e) {
      e.preventDefault();
      if (e.touches && e.touches.length === 2) {
        mode = 'pinch';
        pinchStartDist = dist2(e.touches[0], e.touches[1]);
        pinchStartScale = rsCamera.scale;
        return;
      }
      mode = 'pan'; moved = false;
      const p = pointOf(e);
      startX = p.x; startY = p.y;
      startCamX = rsCamera.x; startCamY = rsCamera.y;
    }
    function onMove(e) {
      if (!mode) return;
      e.preventDefault();
      if (mode === 'pinch' && e.touches && e.touches.length === 2) {
        const d = dist2(e.touches[0], e.touches[1]);
        rsCamera.scale = clampScale(pinchStartScale * (d / Math.max(1, pinchStartDist)));
        return;
      }
      if (mode === 'pan') {
        const p = pointOf(e);
        const dx = p.x - startX, dy = p.y - startY;
        if (Math.hypot(dx, dy) > 6) moved = true;
        rsCamera.x = startCamX - dx / rsCamera.scale;
        rsCamera.y = startCamY - dy / rsCamera.scale;
      }
    }
    function onUp(e) {
      e.preventDefault();
      if (mode === 'pan' && !moved) {
        const rect = canvas.getBoundingClientRect();
        const p = e.changedTouches ? e.changedTouches[0] : e;
        const sx = (p.clientX - rect.left) * (rsW / Math.max(1, rect.width));
        const sy = (p.clientY - rect.top) * (rsH / Math.max(1, rect.height));
        const wx = rsCamera.x + (sx - rsW / 2) / rsCamera.scale;
        const wy = rsCamera.y + (sy - rsH / 2) / rsCamera.scale;
        rsHandleTap(Math.floor(wx), Math.floor(wy));
      }
      mode = null;
    }
    function onWheel(e) {
      e.preventDefault();
      rsCamera.scale = clampScale(rsCamera.scale * (e.deltaY < 0 ? 1.1 : 0.9));
    }

    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', onDown);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onUp);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }

  // ── Toolbar (prawdziwe przyciski HTML, nie rysowane na canvasie — łatwiej
  // trafić palcem, za darmo dostają globalny fix hitboxa/tap-highlight) ──
  // Pogrupowane wg funkcji (kolejność w kolumnie), ale BEZ nagłówków tekstowych
  // — toolbar to teraz wąska pionowa kolumna po lewej stronie canvasu (patrz
  // .games-toolbar w app.html), więc każdy dodatkowy wiersz nagłówka kosztowałby
  // cenne miejsce w pionie. Pierwszy przycisk każdej grupy (poza pierwszą)
  // dostaje klasę rs-group-start — sam odstęp (bez tekstu) jako subtelna
  // wskazówka podziału. "Clear world" dołączony na końcu grupy "tools" (obok
  // Select/Eraser), bo koncepcyjnie to też akcja "narzędziowa", nie osobny
  // klocek do postawienia.
  const RS_TOOL_GROUPS = [
    { tools: ['block', 'wire', 'torch', 'sign'] },
    { tools: ['repeater', 'comparator', 'observer', 'not_gate'] },
    { tools: ['piston', 'sticky_piston'] },
    { tools: ['lever', 'button', 'lamp', 'noteblock', 'meter', 'adder'] },
    { tools: ['select', 'eraser'] },
  ];
  const RS_TOOL_ICON_SIZE = 20;

  function rsBuildToolbar() {
    const el = $('games-toolbar');
    if (!el) return;
    el.style.display = 'flex';
    const labelKeys = { select: 'rsToolSelect', block: 'rsToolBlock', wire: 'rsToolWire', torch: 'rsToolTorch', sign: 'rsToolSign',
      repeater: 'rsToolRepeater', comparator: 'rsToolComparator', observer: 'rsToolObserver', not_gate: 'rsToolNotGate',
      piston: 'rsToolPiston', sticky_piston: 'rsToolStickyPiston', noteblock: 'rsToolNoteBlock',
      lever: 'rsToolLever', button: 'rsToolButton', lamp: 'rsToolLamp', meter: 'rsToolMeter', adder: 'rsToolAdder',
      eraser: 'rsToolEraser' };
    const btnHtml = (id, groupStart) =>
      `<button class="btn-secondary btn-sm${rsTool === id ? ' is-active' : ''}${groupStart ? ' rs-group-start' : ''}" data-rs-tool="${id}">` +
      `<canvas class="rs-tool-icon" data-rs-icon="${id}" width="${RS_TOOL_ICON_SIZE}" height="${RS_TOOL_ICON_SIZE}"></canvas>` +
      `<span>${t(labelKeys[id])}</span></button>`;
    el.innerHTML = RS_TOOL_GROUPS.map((g, gi) =>
      g.tools.map((id, i) => btnHtml(id, gi > 0 && i === 0)).join('')
    ).join('') + `<button class="btn-secondary btn-sm rs-group-start" data-rs-clear="1">` +
      `<canvas class="rs-tool-icon" data-rs-icon="clear" width="${RS_TOOL_ICON_SIZE}" height="${RS_TOOL_ICON_SIZE}"></canvas>` +
      `<span>${t('rsClearWorld')}</span></button>`;

    el.querySelectorAll('canvas[data-rs-icon]').forEach((c) => {
      rsDrawToolIcon(c.getContext('2d'), c.getAttribute('data-rs-icon'), RS_TOOL_ICON_SIZE);
    });

    el.querySelectorAll('button[data-rs-tool]').forEach((b) => {
      b.onclick = () => {
        rsTool = b.getAttribute('data-rs-tool');
        el.querySelectorAll('button[data-rs-tool]').forEach((x) => x.classList.toggle('is-active', x === b));
        rsClosePanel();
      };
    });
    const clearBtn = el.querySelector('button[data-rs-clear]');
    if (clearBtn) clearBtn.onclick = async () => {
      if (!(await confirmDialog(t('rsConfirmClear'), t('rsConfirmClearOk')))) return;
      rsWorld = new Map();
      rsScheduledRepeaters = new Map();
      rsRepeaterActiveNow = new Set();
      rsButtonActive = new Map();
      rsTorchPoweredPrev = new Map();
      rsLastPower = new Map();
      rsScheduledComparators = new Map();
      rsComparatorOutputPrev = new Map();
      rsScheduledObservers = new Map();
      rsObserverPrevSig = new Map();
      rsObserverFiredAtTick = new Map();
      rsScheduledNotGates = new Map();
      rsNotGateActiveNow = new Set();
      rsPistonPoweredPrev = new Map();
      rsScheduledPistons = new Map();
      rsNoteBlockPoweredPrev = new Map();
      rsNoteBlockPulse = new Map();
      rsAdderValue = new Map();
      rsDeniedFlash = new Map();
      rsPistonAnim = new Map();
      rsClosePanel();
      setScore(0);
      rsScheduleSave();
    };
    rsBuildPanel();
  }

  // ── Panel ustawień (Repeater/Comparator/Sign) ──────────────────────────
  // Jak w Minecrafcie (tabliczka/piec/stół rzemieślniczy): dotknięcie jednego
  // z tych komponentów narzędziem "select" otwiera PEŁNOEKRANOWY modal (nie
  // mały pasek wciśnięty w toolbar) z obrotem + parametrem specyficznym dla
  // typu (opóźnienie Repeatera 1-4 / tryb compare-subtract Komparatora /
  // tekst+scal Tabliczki). Ponowne dotknięcie tej samej komórki zamyka panel;
  // zmiana narzędzia też go zamyka.
  //
  // Świadomie NIE jest to `.games-toolbar`-owy wiersz przyklejony obok
  // toolbara (jak wcześniej) — odkąd toolbar dostał kolumnę po lewej
  // (.games-canvas-row), taki panel stawał się TRZECIM elementem tego
  // samego wiersza flex, ściśniętym między toolbarem a canvasem: input
  // tekstowy był obcięty/ledwo klikalny, a tapnięcia bywały łapane przez
  // sąsiadujący canvas zamiast panelu. Reużywamy zamiast tego istniejący,
  // sprawdzony wzorzec `.modal-overlay`/`.modal` (patrz app.html — te same
  // klasy co confirmDialog/poziom-up itd.), wstawiany do document.body:
  // position:fixed + z-index:2100 gwarantuje, że renderuje się NAD wszystkim
  // (w tym trybem pełnoekranowym gry, z-index 2000) i nigdy nie jest
  // przycięty przez żaden kontener układu.
  function rsBuildPanel() {
    let overlay = $('games-rs-panel-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'games-rs-panel-overlay';
      overlay.className = 'modal-overlay';
      overlay.innerHTML =
        `<div class="modal" style="max-width:340px;text-align:center">` +
        `<h3 id="games-rs-panel-title"></h3>` +
        `<div id="games-rs-panel-body" style="display:flex;flex-direction:column;gap:10px"></div>` +
        `<button class="btn-secondary" style="width:100%;margin-top:18px" data-rs-panel-close="1">✕ ${t('rsPanelClose')}</button>` +
        `</div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('button[data-rs-panel-close]').onclick = () => rsClosePanel();
    }
    return overlay;
  }

  function rsOpenPanel(key) {
    rsPanelKey = (rsPanelKey === key) ? null : key;
    rsRenderPanel();
  }

  function rsClosePanel() {
    if (rsPanelKey === null) return;
    rsPanelKey = null;
    rsRenderPanel();
  }

  const RS_PANEL_TYPES = new Set(['repeater', 'comparator', 'sign']);
  const RS_SIGN_MAX_LEN = 20;

  function rsRenderPanel() {
    const overlay = rsBuildPanel();
    if (!overlay) return;
    const cell = rsPanelKey ? rsWorld.get(rsPanelKey) : null;
    if (!cell || !RS_PANEL_TYPES.has(cell.type)) {
      overlay.classList.remove('open');
      rsPanelKey = null;
      return;
    }
    overlay.classList.add('open');
    const title = $('games-rs-panel-title');
    const body = $('games-rs-panel-body');
    const labelKeys = { sign: 'rsToolSign', repeater: 'rsToolRepeater', comparator: 'rsToolComparator' };
    if (title) title.textContent = t(labelKeys[cell.type]);

    if (cell.type === 'sign') {
      // Tabliczka nie ma obrotu (czysta etykieta) — panel to tylko pole
      // tekstowe (limit RS_SIGN_MAX_LEN znaków) + przełącznik "połącz z
      // sąsiadami" (patrz rsDrawSignsOverlay: sąsiednie Tabliczki z
      // separate=false renderują się jako jedna wspólna tabliczka).
      body.innerHTML =
        `<input type="text" maxlength="${RS_SIGN_MAX_LEN}" placeholder="${t('rsPanelSignPlaceholder')}" style="width:100%;padding:10px 12px;font-size:15px;box-sizing:border-box" data-rs-panel-sign-text="1">` +
        `<button class="btn-secondary${cell.separate ? '' : ' is-active'}" data-rs-panel-sign-merge="1">${t('rsPanelMerge')}</button>` +
        `<button class="btn-secondary${cell.separate ? ' is-active' : ''}" data-rs-panel-sign-separate="1">${t('rsPanelSeparate')}</button>`;
      const textInput = body.querySelector('input[data-rs-panel-sign-text]');
      if (textInput) {
        textInput.value = cell.text || '';
        textInput.oninput = () => { cell.text = textInput.value.slice(0, RS_SIGN_MAX_LEN); rsScheduleSave(); };
        textInput.focus();
      }
      const mergeBtn = body.querySelector('button[data-rs-panel-sign-merge]');
      if (mergeBtn) mergeBtn.onclick = () => { cell.separate = false; rsScheduleSave(); rsRenderPanel(); };
      const separateBtn = body.querySelector('button[data-rs-panel-sign-separate]');
      if (separateBtn) separateBtn.onclick = () => { cell.separate = true; rsScheduleSave(); rsRenderPanel(); };
      return;
    }

    let html = `<button class="btn-secondary" data-rs-panel-rotate="1">↻ ${t('rsPanelRotate')}</button>`;
    if (cell.type === 'repeater') {
      html += `<span class="text2" style="font-size:13px">${t('rsPanelDelay')}:</span>`;
      html += `<div style="display:flex;gap:8px">` + [1, 2, 3, 4].map((n) =>
        `<button class="btn-secondary${(cell.delay || 1) === n ? ' is-active' : ''}" style="flex:1" data-rs-panel-delay="${n}">${n}</button>`
      ).join('') + `</div>`;
    } else {
      html += `<span class="text2" style="font-size:13px">${t('rsPanelMode')}:</span>`;
      html += `<button class="btn-secondary${cell.mode === 'compare' ? ' is-active' : ''}" data-rs-panel-mode="compare">${t('rsModeCompare')}</button>`;
      html += `<button class="btn-secondary${cell.mode === 'subtract' ? ' is-active' : ''}" data-rs-panel-mode="subtract">${t('rsModeSubtract')}</button>`;
    }
    body.innerHTML = html;

    const rotateBtn = body.querySelector('button[data-rs-panel-rotate]');
    if (rotateBtn) rotateBtn.onclick = () => { cell.rotation = (cell.rotation + 1) % 4; rsScheduleSave(); };
    body.querySelectorAll('button[data-rs-panel-delay]').forEach((b) => {
      b.onclick = () => { cell.delay = parseInt(b.getAttribute('data-rs-panel-delay'), 10); rsScheduleSave(); rsRenderPanel(); };
    });
    body.querySelectorAll('button[data-rs-panel-mode]').forEach((b) => {
      b.onclick = () => { cell.mode = b.getAttribute('data-rs-panel-mode'); rsScheduleSave(); rsRenderPanel(); };
    });
  }

  // ── Rysowanie (kolory/kształty wektorowe — brak grafik, czytelność przede
  // wszystkim: jasność przewodu = aktualna siła sygnału, jak w prawdziwym MC) ──
  function rsLerpColor(c1, c2, tt) {
    return `rgb(${Math.round(c1[0] + (c2[0] - c1[0]) * tt)},${Math.round(c1[1] + (c2[1] - c1[1]) * tt)},${Math.round(c1[2] + (c2[2] - c1[2]) * tt)})`;
  }

  function rsDrawGrid(ctx, W, H) {
    ctx.fillStyle = RS_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    const halfW = (W / 2) / rsCamera.scale, halfH = (H / 2) / rsCamera.scale;
    const minX = Math.floor(rsCamera.x - halfW) - 1, maxX = Math.ceil(rsCamera.x + halfW) + 1;
    const minY = Math.floor(rsCamera.y - halfH) - 1, maxY = Math.ceil(rsCamera.y + halfH) + 1;
    ctx.beginPath();
    for (let x = minX; x <= maxX; x++) { const { sx } = rsWorldToScreen(x, 0); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); }
    for (let y = minY; y <= maxY; y++) { const { sy } = rsWorldToScreen(0, y); ctx.moveTo(0, sy); ctx.lineTo(W, sy); }
    ctx.stroke();
  }

  function rsDrawBlock(ctx, sx, sy, s, cell, key) {
    ctx.fillStyle = RS_BORDER;
    ctx.fillRect(sx + 1, sy + 1, s - 2, s - 2);
  }

  // Pochodnia — samodzielny, obracalny klocek (już NIE flaga na Bloku): patyk
  // + płomień narysowane OD ŚRODKA komórki w stronę `rotation` (front —
  // "sterczy" w tę stronę), z małym "montażem" po przeciwnej stronie (back —
  // wizualnie "ściana", do której jest przyczepiona). Kierunek jest tu czysto
  // kosmetyczny (nie zawęża, co może ją zgasić — patrz komentarz w FAZA 2 przy
  // relayInto: Pochodnia reaguje na zasilenie WŁASNEJ komórki z DOWOLNEJ
  // strony, dokładnie jak w Minecrafcie, gdzie zależy to od tego, który Blok
  // ją wspiera, a nie od jednej wybranej ściany).
  function rsDrawTorch(ctx, sx, sy, s, cell, key) {
    const d = RS_DIR[cell.rotation];
    const cx = sx + s / 2, cy = sy + s / 2;
    const lit = rsTorchLitForDraw(key);
    // Mały "montaż" po stronie back — pokazuje, do czego jest przyczepiona.
    ctx.fillStyle = RS_COMPONENT_BORDER;
    ctx.fillRect(cx - d[0] * s * 0.32 - s * 0.07, cy - d[1] * s * 0.32 - s * 0.07, s * 0.14, s * 0.14);
    ctx.fillStyle = lit ? '#ff6b1a' : '#4a2a1a';
    ctx.fillRect(cx - s * 0.05, cy - s * 0.18, s * 0.1, s * 0.36);
    if (lit) {
      ctx.fillStyle = '#ffcf4d';
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.22, s * 0.09, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Czy Pochodnia świeci NA POTRZEBY RYSOWANIA — poza tickiem symulacji
  // (render rAF jest niezależny od tick 100ms) jedyny wiarygodny sygnał to
  // rsTorchPoweredPrev (to samo, czego używa FAZA 1 do decyzji "świecić w tym
  // ticku"): nie świeci, gdy jej WŁASNA komórka była zasilona w poprzednim ticku.
  function rsTorchLitForDraw(key) {
    return !rsTorchPoweredPrev.get(key);
  }

  // NOT Gate — jak Repeater (strzałka kierunku + tło), ale z okrągłą
  // "bąbelkiem" na wejściu (klasyczny symbol negacji z bramek logicznych),
  // żeby nie dało się go pomylić z Repeaterem na pierwszy rzut oka.
  function rsDrawNotGate(ctx, sx, sy, s, cell, key) {
    ctx.fillStyle = RS_COMPONENT_BG;
    ctx.fillRect(sx + s * 0.1, sy + s * 0.1, s * 0.8, s * 0.8);
    ctx.strokeStyle = RS_COMPONENT_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + s * 0.1, sy + s * 0.1, s * 0.8, s * 0.8);
    const active = rsScheduledNotGates.has(key);
    const d = RS_DIR[cell.rotation];
    const cx = sx + s / 2, cy = sy + s / 2;
    const color = active ? '#ff6b1a' : '#c7cbe0';
    rsDrawDirArrow(ctx, cx, cy, d, s, color);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.beginPath();
    ctx.arc(cx - d[0] * s * 0.3, cy - d[1] * s * 0.3, s * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  }

  function rsDrawWire(ctx, sx, sy, s, x, y, key) {
    const lvl = rsLastPower.get(key) || 0;
    const color = rsLerpColor(RS_WIRE_OFF, RS_WIRE_ON, lvl / 15);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, s * 0.16);
    ctx.lineCap = 'round';
    const cx = sx + s / 2, cy = sy + s / 2;
    let connected = false;
    for (const [dx, dy] of RS_ORTHO) {
      if (rsWorld.has(rsKey(x + dx, y + dy))) {
        connected = true;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * s / 2, cy + dy * s / 2); ctx.stroke();
      }
    }
    ctx.beginPath(); ctx.arc(cx, cy, s * (connected ? 0.1 : 0.12), 0, Math.PI * 2); ctx.fill();
  }

  // Trójkątna strzałka wskazująca kierunek — współdzielona przez Repeater/
  // Comparator/Observer/Piston, żeby "w którą stronę patrzy" było czytelne na
  // pierwszy rzut oka (dawniej Repeater/Comparator rysowały dwie IDENTYCZNE
  // kropki wzdłuż osi — bez żadnej wskazówki, która jest wejściem a która
  // wyjściem).
  function rsDrawDirArrow(ctx, cx, cy, d, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx + d[0] * s * 0.32, cy + d[1] * s * 0.32);
    ctx.lineTo(cx + d[0] * s * 0.1 - d[1] * s * 0.14, cy + d[1] * s * 0.1 - d[0] * s * 0.14);
    ctx.lineTo(cx + d[0] * s * 0.1 + d[1] * s * 0.14, cy + d[1] * s * 0.1 + d[0] * s * 0.14);
    ctx.closePath();
    ctx.fill();
  }

  function rsDrawRepeater(ctx, sx, sy, s, cell, key) {
    ctx.fillStyle = RS_COMPONENT_BG;
    ctx.fillRect(sx + s * 0.1, sy + s * 0.1, s * 0.8, s * 0.8);
    ctx.strokeStyle = RS_COMPONENT_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + s * 0.1, sy + s * 0.1, s * 0.8, s * 0.8);
    const active = rsScheduledRepeaters.has(key);
    const d = RS_DIR[cell.rotation];
    const cx = sx + s / 2, cy = sy + s / 2;
    rsDrawDirArrow(ctx, cx, cy, d, s, active ? '#ff6b1a' : '#c7cbe0');
    // Kreski opóźnienia (1-4, ustawiane w panelu ustawień) w poprzek bliżej
    // wejścia — jak liczba "pochodni" na Repeaterze w Minecrafcie, żeby
    // opóźnienie było widać od razu, a nie tylko odczuwalne w czasie.
    const perp = [-d[1], d[0]];
    const delay = cell.delay || 1;
    ctx.fillStyle = active ? '#ff9d52' : '#8a8fa8';
    for (let i = 0; i < delay; i++) {
      const t = (i - (delay - 1) / 2) * 0.22;
      const bx = cx - d[0] * s * 0.28 + perp[0] * s * t;
      const by = cy - d[1] * s * 0.28 + perp[1] * s * t;
      ctx.fillRect(bx - s * 0.03, by - s * 0.03, s * 0.06, s * 0.06);
    }
  }

  function rsDrawComparator(ctx, sx, sy, s, cell, key) {
    ctx.fillStyle = RS_COMPONENT_BG;
    ctx.fillRect(sx + s * 0.1, sy + s * 0.1, s * 0.8, s * 0.8);
    ctx.strokeStyle = RS_COMPONENT_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + s * 0.1, sy + s * 0.1, s * 0.8, s * 0.8);
    const out = rsComparatorOutputPrev.get(key) || 0;
    const d = RS_DIR[cell.rotation];
    const cx = sx + s / 2, cy = sy + s / 2;
    // Strzałka = kierunek wyjścia, jasność wg aktualnej siły wyjścia — spójne
    // z konwencją przewodu (rsDrawWire).
    rsDrawDirArrow(ctx, cx, cy, d, s, out > 0 ? rsLerpColor(RS_WIRE_OFF, RS_WIRE_ON, out / 15) : '#c7cbe0');
    // Środkowa kropka = tryb (szara = compare, pomarańczowa = subtract).
    ctx.fillStyle = cell.mode === 'subtract' ? '#ff6b1a' : '#8a8fa8';
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.07, 0, Math.PI * 2); ctx.fill();
  }

  function rsDrawObserver(ctx, sx, sy, s, cell, key) {
    ctx.fillStyle = RS_COMPONENT_BG;
    ctx.fillRect(sx + s * 0.08, sy + s * 0.08, s * 0.84, s * 0.84);
    ctx.strokeStyle = RS_COMPONENT_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + s * 0.08, sy + s * 0.08, s * 0.84, s * 0.84);
    const d = RS_DIR[cell.rotation];
    const cx = sx + s / 2, cy = sy + s / 2;
    const pulsing = rsScheduledObservers.has(key);
    // Strzałka = kierunek OBSERWACJI (froncie), podświetla się dokładnie
    // przez 1 tick gdy zaplanowany jest impuls (impuls wychodzi z tyłu, jak
    // w Minecrafcie — patrz FAZA 1/5).
    rsDrawDirArrow(ctx, cx, cy, d, s, pulsing ? '#ff6b1a' : '#c7cbe0');
  }

  function rsDrawPiston(ctx, sx, sy, s, cell, x, y) {
    const sticky = cell.type === 'sticky_piston';
    ctx.fillStyle = RS_BORDER;
    ctx.fillRect(sx + 1, sy + 1, s - 2, s - 2);
    const d = RS_DIR[cell.rotation];
    const cx = sx + s / 2, cy = sy + s / 2;
    // Strzałka kierunku pchania — kolor odróżnia sticky (zielony) od zwykłego (szary).
    rsDrawDirArrow(ctx, cx, cy, d, s, sticky ? '#4ecca3' : '#c7cbe0');
    const anim = rsPistonAnimProgress(rsKey(x, y), cell);
    if (anim > 0) {
      // Ramię/głowica tłoka — jeden ciągły pasek od krawędzi korpusu tłoka
      // (a nie luźny, oderwany prostokąt na środku sąsiedniej komórki jak
      // poprzednio) aż po wyraźną "czapeczkę" głowicy, animowany od 0 (schowany)
      // do 1 (w pełni wysunięty) przez RS_PISTON_ANIM_MS, niezależnie od ticku
      // symulacji (płynny rAF).
      const bodyEdge = 0.5, headLen = 0.62 * anim;
      const barColor = sticky ? '#2f8a68' : '#6b7280';
      const headColor = sticky ? '#4ecca3' : '#9aa0b4';
      ctx.fillStyle = barColor;
      if (d[0] !== 0) ctx.fillRect(cx + d[0] * s * bodyEdge - (d[0] > 0 ? 0 : s * headLen), cy - s * 0.12, s * headLen, s * 0.24);
      else ctx.fillRect(cx - s * 0.12, cy + d[1] * s * bodyEdge - (d[1] > 0 ? 0 : s * headLen), s * 0.24, s * headLen);
      const headCx = cx + d[0] * s * (bodyEdge + headLen), headCy = cy + d[1] * s * (bodyEdge + headLen);
      ctx.fillStyle = headColor;
      if (d[0] !== 0) ctx.fillRect(headCx - s * 0.06, cy - s * 0.22, s * 0.12, s * 0.44);
      else ctx.fillRect(cx - s * 0.22, headCy - s * 0.06, s * 0.44, s * 0.12);
    }
  }

  function rsDrawNoteBlock(ctx, sx, sy, s, cell, key) {
    const flashing = (rsNoteBlockPulse.get(key) || 0) > rsTick;
    ctx.fillStyle = flashing ? '#8a5a2a' : RS_BORDER;
    ctx.fillRect(sx + 1, sy + 1, s - 2, s - 2);
    // Symbol nutki + numer wysokości tonu (0-24), podświetlone przy graniu.
    ctx.fillStyle = flashing ? '#ffd700' : '#c9a96e';
    ctx.beginPath(); ctx.arc(sx + s * 0.4, sy + s * 0.62, s * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(sx + s * 0.47, sy + s * 0.28, s * 0.05, s * 0.34);
    ctx.fillStyle = RS_TEXT2;
    ctx.font = Math.round(s * 0.22) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(cell.pitch), sx + s * 0.72, sy + s * 0.35);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function rsDrawLever(ctx, sx, sy, s, cell) {
    ctx.fillStyle = RS_BORDER;
    ctx.fillRect(sx + s * 0.3, sy + s * 0.6, s * 0.4, s * 0.3);
    ctx.strokeStyle = cell.on ? '#4ecca3' : '#8a8fa8';
    ctx.lineWidth = Math.max(2, s * 0.1);
    ctx.beginPath();
    ctx.moveTo(sx + s / 2, sy + s * 0.65);
    ctx.lineTo(cell.on ? sx + s * 0.72 : sx + s * 0.28, sy + s * 0.28);
    ctx.stroke();
  }

  function rsDrawButton(ctx, sx, sy, s, key) {
    const active = (rsButtonActive.get(key) || 0) > rsTick;
    ctx.fillStyle = RS_BORDER;
    ctx.fillRect(sx + s * 0.25, sy + s * 0.4, s * 0.5, s * 0.2);
    ctx.fillStyle = active ? '#ff6b1a' : '#8a8fa8';
    ctx.fillRect(sx + s * 0.35, sy + (active ? s * 0.42 : s * 0.36), s * 0.3, s * 0.12);
  }

  function rsDrawLamp(ctx, sx, sy, s, key) {
    const lit = (rsLastPower.get(key) || 0) > 0;
    ctx.fillStyle = lit ? '#fff3c0' : '#3a3d4d';
    ctx.beginPath(); ctx.arc(sx + s / 2, sy + s / 2, s * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = RS_BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Signal Meter/Adder — bierne "sondy", numer zamiast światła/dźwięku.
  // Meter = najsilniejszy sygnał dotykający komórki (rsLastPower, jak Lampa).
  // Adder = suma sygnałów z KAŻDEJ z 4 stron osobno (rsAdderValue, liczone w
  // FAZA 6 — patrz tam, bo `power` trzyma tylko jedną wartość na komórkę).
  // Żaden z nich nie przewodzi dalej (patrz rsCellPowerFor) — to gwarantuje,
  // że wstawienie ich w środek obwodu nie przepuszcza sygnału.
  function rsDrawMeter(ctx, sx, sy, s, key) {
    rsDrawProbe(ctx, sx, sy, s, rsLastPower.get(key) || 0, '#8fd6ff');
  }
  function rsDrawAdder(ctx, sx, sy, s, key) {
    rsDrawProbe(ctx, sx, sy, s, rsAdderValue.get(key) || 0, '#ffb84d');
  }
  function rsDrawProbe(ctx, sx, sy, s, value, color) {
    ctx.fillStyle = RS_COMPONENT_BG;
    ctx.fillRect(sx + 1, sy + 1, s - 2, s - 2);
    ctx.strokeStyle = RS_COMPONENT_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 1, sy + 1, s - 2, s - 2);
    ctx.fillStyle = value > 0 ? color : RS_TEXT2;
    ctx.font = 'bold ' + Math.round(s * 0.4) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(value), sx + s / 2, sy + s / 2 + s * 0.02);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function rsDrawCell(ctx, x, y, cell, key) {
    const { sx, sy } = rsWorldToScreen(x, y);
    const s = rsCamera.scale;
    if (cell.type === 'block') rsDrawBlock(ctx, sx, sy, s, cell, key);
    else if (cell.type === 'wire') rsDrawWire(ctx, sx, sy, s, x, y, key);
    else if (cell.type === 'torch') rsDrawTorch(ctx, sx, sy, s, cell, key);
    else if (cell.type === 'repeater') rsDrawRepeater(ctx, sx, sy, s, cell, key);
    else if (cell.type === 'comparator') rsDrawComparator(ctx, sx, sy, s, cell, key);
    else if (cell.type === 'observer') rsDrawObserver(ctx, sx, sy, s, cell, key);
    else if (cell.type === 'not_gate') rsDrawNotGate(ctx, sx, sy, s, cell, key);
    else if (cell.type === 'piston' || cell.type === 'sticky_piston') rsDrawPiston(ctx, sx, sy, s, cell, x, y);
    else if (cell.type === 'noteblock') rsDrawNoteBlock(ctx, sx, sy, s, cell, key);
    else if (cell.type === 'lever') rsDrawLever(ctx, sx, sy, s, cell);
    else if (cell.type === 'button') rsDrawButton(ctx, sx, sy, s, key);
    else if (cell.type === 'lamp') rsDrawLamp(ctx, sx, sy, s, key);
    else if (cell.type === 'meter') rsDrawMeter(ctx, sx, sy, s, key);
    else if (cell.type === 'adder') rsDrawAdder(ctx, sx, sy, s, key);
    // 'sign' celowo pominięta tutaj — rysowana osobno przez
    // rsDrawSignsOverlay (patrz step()), NA WIERZCHU wszystkiego innego, bo
    // jej tablica bywa szersza niż jedna komórka.
  }

  // Tabliczki (Sign) — czysto informacyjne, nie przewodzą (patrz
  // NON_CONDUCTIVE w rsTick_) i nie są pushable (piston je niszczy jak
  // dźwignię/pochodnię). Grupuje sąsiednie Tabliczki W TYM SAMYM WIERSZU
  // (kolejne x, ta sama y) w JEDNĄ wspólną tablicę, o ile ŻADNA z nich nie ma
  // separate=true — tablica z separate=true zawsze rysuje się osobno, z
  // przerwą, nawet dotykając sąsiada (dokładnie żądanie: "jak postawię dwie
  // obok siebie robi się jedna, ale można zrobić żeby były oddzielne").
  // Scelowo TYLKO poziomo — czytelniejsze niż też pionowe łączenie, a
  // grupowanie zostaje proste.
  function rsDrawSignsOverlay(ctx, minX, maxX, minY, maxY) {
    const rows = new Map(); // y -> [{x,key,cell}, ...] posortowane po x
    for (const [key, cell] of rsWorld) {
      if (cell.type !== 'sign') continue;
      const [x, y] = rsParseKey(key);
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x, key, cell });
    }
    for (const [y, list] of rows) {
      list.sort((a, b) => a.x - b.x);
      let i = 0;
      while (i < list.length) {
        const run = [list[i]];
        if (!list[i].cell.separate) {
          let j = i + 1;
          while (j < list.length && list[j].x === run[run.length - 1].x + 1 && !list[j].cell.separate) {
            run.push(list[j]);
            j++;
          }
          i = j;
        } else {
          i++;
        }
        rsDrawSignRun(ctx, run, y);
      }
    }
  }

  function rsDrawSignRun(ctx, run, y) {
    const s = rsCamera.scale;
    const text = run.map((r) => r.cell.text || '').join(' ').trim();
    ctx.font = Math.round(s * 0.32) + 'px sans-serif';
    const textWidth = text ? ctx.measureText(text).width : 0;
    const padding = s * 0.3;
    const minWidthPx = run.length * s - 4;
    const boardWidth = Math.max(minWidthPx, textWidth + padding * 2);
    const boardHeight = s * 0.5;
    const spanCenterWorldX = (run[0].x + run[run.length - 1].x) / 2 + 0.5;
    const center = rsWorldToScreen(spanCenterWorldX, y + 0.5);
    const left = center.sx - boardWidth / 2, top = center.sy - boardHeight / 2;
    const r = Math.min(6, boardHeight / 3);

    ctx.fillStyle = '#e8dcc0';
    ctx.strokeStyle = '#8a6d3b';
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath();
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + boardWidth - r, top);
    ctx.quadraticCurveTo(left + boardWidth, top, left + boardWidth, top + r);
    ctx.lineTo(left + boardWidth, top + boardHeight - r);
    ctx.quadraticCurveTo(left + boardWidth, top + boardHeight, left + boardWidth - r, top + boardHeight);
    ctx.lineTo(left + r, top + boardHeight);
    ctx.quadraticCurveTo(left, top + boardHeight, left, top + boardHeight - r);
    ctx.lineTo(left, top + r);
    ctx.quadraticCurveTo(left, top, left + r, top);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (text) {
      ctx.fillStyle = '#3a2f1a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, center.sx, center.sy + s * 0.02);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }

  // Ikonki przycisków toolbara — dla każdego prawdziwego typu komórki
  // wywołują DOKŁADNIE tę samą funkcję rysującą co siatka gry (z jedną
  // reprezentatywną komórką-przykładem, niepowiązaną kluczem z żadną mapą
  // stanu — więc wychodzi domyślny/nieaktywny wygląd), więc ikonka fizycznie
  // nie może rozjechać się z prawdziwym wyglądem w grze. Select/Eraser nie
  // odpowiadają żadnej komórce, więc mają proste, osobne glify; Tabliczka jest
  // rysowana osobnym overlayem sprzężonym z kamerą (rsDrawSignRun), więc
  // dostaje uproszczoną wersję tej samej palety kolorów zamiast wywołania tej
  // funkcji wprost.
  function rsDrawToolIcon(ctx, tool, size) {
    ctx.clearRect(0, 0, size, size);
    const sx = 0, sy = 0, s = size;
    const key = '__toolicon__'; // celowo nieobecny w żadnej mapie stanu
    const rot0 = 0; // wschód — kierunek domyślny dla ikon
    if (tool === 'block') rsDrawBlock(ctx, sx, sy, s, {}, key);
    else if (tool === 'wire') rsDrawWire(ctx, sx, sy, s, -99999, -99999, key);
    else if (tool === 'torch') rsDrawTorch(ctx, sx, sy, s, { rotation: rot0 }, key);
    else if (tool === 'sign') rsDrawToolIconSign(ctx, sx, sy, s);
    else if (tool === 'repeater') rsDrawRepeater(ctx, sx, sy, s, { rotation: rot0, delay: 1 }, key);
    else if (tool === 'comparator') rsDrawComparator(ctx, sx, sy, s, { rotation: rot0, mode: 'compare' }, key);
    else if (tool === 'observer') rsDrawObserver(ctx, sx, sy, s, { rotation: rot0 }, key);
    else if (tool === 'not_gate') rsDrawNotGate(ctx, sx, sy, s, { rotation: rot0 }, key);
    else if (tool === 'piston') rsDrawPiston(ctx, sx, sy, s, { type: 'piston', rotation: rot0, extended: false }, -99999, -99999);
    else if (tool === 'sticky_piston') rsDrawPiston(ctx, sx, sy, s, { type: 'sticky_piston', rotation: rot0, extended: false }, -99999, -99999);
    else if (tool === 'noteblock') rsDrawNoteBlock(ctx, sx, sy, s, { pitch: 12 }, key);
    else if (tool === 'lever') rsDrawLever(ctx, sx, sy, s, { on: false });
    else if (tool === 'button') rsDrawButton(ctx, sx, sy, s, key);
    else if (tool === 'lamp') rsDrawLamp(ctx, sx, sy, s, key);
    else if (tool === 'meter') rsDrawMeter(ctx, sx, sy, s, key);
    else if (tool === 'adder') rsDrawAdder(ctx, sx, sy, s, key);
    else if (tool === 'select') rsDrawToolIconSelect(ctx, sx, sy, s);
    else if (tool === 'eraser') rsDrawToolIconEraser(ctx, sx, sy, s);
    else if (tool === 'clear') rsDrawToolIconClear(ctx, sx, sy, s);
  }

  function rsDrawToolIconSign(ctx, sx, sy, s) {
    ctx.fillStyle = '#e8dcc0';
    ctx.strokeStyle = '#8a6d3b';
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.fillRect(sx + s * 0.06, sy + s * 0.28, s * 0.88, s * 0.44);
    ctx.strokeRect(sx + s * 0.06, sy + s * 0.28, s * 0.88, s * 0.44);
    ctx.strokeStyle = '#3a2f1a';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(sx + s * 0.2, sy + s * 0.5); ctx.lineTo(sx + s * 0.5, sy + s * 0.5);
    ctx.moveTo(sx + s * 0.2, sy + s * 0.62); ctx.lineTo(sx + s * 0.65, sy + s * 0.62);
    ctx.stroke();
  }

  function rsDrawToolIconSelect(ctx, sx, sy, s) {
    ctx.strokeStyle = '#c7cbe0';
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.setLineDash([s * 0.14, s * 0.1]);
    ctx.strokeRect(sx + s * 0.16, sy + s * 0.16, s * 0.68, s * 0.68);
    ctx.setLineDash([]);
  }

  function rsDrawToolIconEraser(ctx, sx, sy, s) {
    ctx.save();
    ctx.translate(sx + s / 2, sy + s / 2);
    ctx.rotate(-Math.PI / 8);
    ctx.fillStyle = '#ff6b7a';
    ctx.fillRect(-s * 0.34, -s * 0.2, s * 0.68, s * 0.4);
    ctx.fillStyle = '#ffb0b8';
    ctx.fillRect(-s * 0.34, -s * 0.2, s * 0.26, s * 0.4);
    ctx.strokeStyle = RS_COMPONENT_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(-s * 0.34, -s * 0.2, s * 0.68, s * 0.4);
    ctx.restore();
  }

  function rsDrawToolIconClear(ctx, sx, sy, s) {
    ctx.strokeStyle = '#c7cbe0';
    ctx.fillStyle = '#c7cbe0';
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.fillRect(sx + s * 0.28, sy + s * 0.14, s * 0.44, s * 0.08);
    ctx.beginPath();
    ctx.moveTo(sx + s * 0.36, sy + s * 0.14); ctx.lineTo(sx + s * 0.4, sy + s * 0.06);
    ctx.lineTo(sx + s * 0.6, sy + s * 0.06); ctx.lineTo(sx + s * 0.64, sy + s * 0.14);
    ctx.stroke();
    ctx.strokeRect(sx + s * 0.24, sy + s * 0.24, s * 0.52, s * 0.62);
    ctx.beginPath();
    ctx.moveTo(sx + s * 0.38, sy + s * 0.32); ctx.lineTo(sx + s * 0.38, sy + s * 0.76);
    ctx.moveTo(sx + s * 0.5, sy + s * 0.32); ctx.lineTo(sx + s * 0.5, sy + s * 0.76);
    ctx.moveTo(sx + s * 0.62, sy + s * 0.32); ctx.lineTo(sx + s * 0.62, sy + s * 0.76);
    ctx.stroke();
  }

  function startRedstone() {
    rsTool = 'select';
    rsLoadWorld();
    // Toolbar MUSI być zbudowany PRZED setupCanvas(): ten ostatni mierzy
    // realną dostępną szerokość (canvas.clientWidth, zależną od tego, ile
    // miejsca zajmuje kolumna toolbara w tym samym wierszu) i ustawia
    // toolbarowi max-height dopasowany do wysokości canvasu — gdyby toolbar
    // był jeszcze pusty/display:none w tym momencie, obie te wartości
    // wyszłyby błędne (canvas myślałby, że ma więcej miejsca niż naprawdę
    // ma, a toolbar dostałby złe ograniczenie wysokości).
    rsBuildToolbar();
    const { canvas, ctx, W, H } = setupCanvas(1);
    rsW = W; rsH = H;
    setScore(rsWorld.size);
    setBestLabel(getBest('redstone'));

    const unbindGestures = rsBindGestures(canvas);
    if (rsSimTimer) clearInterval(rsSimTimer);
    rsSimTimer = setInterval(rsTick_, RS_TICK_MS);

    function step() {
      ctx.clearRect(0, 0, rsW, rsH);
      rsDrawGrid(ctx, rsW, rsH);
      const halfW = (rsW / 2) / rsCamera.scale, halfH = (rsH / 2) / rsCamera.scale;
      const minX = Math.floor(rsCamera.x - halfW) - 1, maxX = Math.ceil(rsCamera.x + halfW) + 1;
      const minY = Math.floor(rsCamera.y - halfH) - 1, maxY = Math.ceil(rsCamera.y + halfH) + 1;
      for (const [key, cell] of rsWorld) {
        const [x, y] = rsParseKey(key);
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        rsDrawCell(ctx, x, y, cell, key);
      }
      // Czerwony błysk "odrzucono" na polach, gdzie stawianie właśnie zawiodło
      // bo pole jest zajęte (patrz rsHandleTap) — bez tego niepowodzenie jest
      // ciche i wygląda jak zepsute stawianie klocków.
      for (const [key, until] of rsDeniedFlash) {
        if (until <= rsTick) { rsDeniedFlash.delete(key); continue; }
        const [x, y] = rsParseKey(key);
        const { sx, sy } = rsWorldToScreen(x, y);
        const s = rsCamera.scale;
        ctx.strokeStyle = RS_DENIED_COLOR;
        ctx.lineWidth = Math.max(2, s * 0.12);
        ctx.strokeRect(sx + 2, sy + 2, s - 4, s - 4);
      }
      // Tabliczki — OSOBNY przebieg, NA WIERZCHU wszystkiego (patrz
      // rsDrawSignsOverlay): ich tablica bywa szersza niż jedna komórka.
      rsDrawSignsOverlay(ctx, minX, maxX, minY, maxY);
    }

    engine = {
      // Uwaga: to jedyna gra z własnym setInterval — stopEngine()/runLoop nie
      // wiedzą o nim nic, więc MUSI być czyszczony tutaj ręcznie. Zapis też
      // wykonujemy od razu (nie czekamy na debounce) — inaczej ostatnia zmiana
      // sprzed wyjścia mogłaby przepaść.
      stop() {
        unbindGestures();
        if (rsSimTimer) { clearInterval(rsSimTimer); rsSimTimer = 0; }
        clearTimeout(rsSaveT);
        rsSaveWorld();
        if (rsAudioCtx) { rsAudioCtx.close().catch(() => {}); rsAudioCtx = null; }
        const tb = $('games-toolbar');
        if (tb) { tb.innerHTML = ''; tb.style.display = 'none'; }
        const overlay = $('games-rs-panel-overlay');
        if (overlay) overlay.classList.remove('open');
        rsPanelKey = null;
      },
    };
    runLoop(step);
  }

  // ── API publiczne ─────────────────────────────────────
  const STARTERS = { coins: startCoins, snake: startSnake, g2048: start2048, redstone: startRedstone };

  window.LifeXPGames = {
    showMenu,
    exit: showMenu,
    toggleFullscreen,
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
    // Tylko do debugowania/testów — odczyt stanu symulacji Redstone bez
    // polegania na renderze (przydatne np. gdy rAF nie chodzi w tle karty).
    // Read-only, zero wpływu na rozgrywkę.
    _debugRedstone() {
      return {
        tick: rsTick,
        power: Array.from(rsLastPower.entries()),
        torchPowered: Array.from(rsTorchPoweredPrev.entries()),
        scheduledRepeaters: Array.from(rsScheduledRepeaters.entries()),
        scheduledNotGates: Array.from(rsScheduledNotGates.entries()),
        scheduledComparators: Array.from(rsScheduledComparators.entries()),
        comparatorOutputPrev: Array.from(rsComparatorOutputPrev.entries()),
        scheduledObservers: Array.from(rsScheduledObservers.entries()),
        observerPrevSig: Array.from(rsObserverPrevSig.entries()),
        observerFiredAtTick: Array.from(rsObserverFiredAtTick.entries()),
        pistonPoweredPrev: Array.from(rsPistonPoweredPrev.entries()),
        scheduledPistons: Array.from(rsScheduledPistons.entries()),
        noteBlockPoweredPrev: Array.from(rsNoteBlockPoweredPrev.entries()),
        adderValue: Array.from(rsAdderValue.entries()),
        cells: Array.from(rsWorld.entries()),
      };
    },
  };
})();
