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
    let cssW;
    if (fsMode) {
      // Pełny ekran = sama gra. Chowamy tytuł/hint (CSS), zostaje tylko cienki
      // pasek z wynikiem i „✕", więc canvas wypełnia niemal cały ekran (proporcje zachowane).
      const availW = window.innerWidth - 12;
      const availH = window.innerHeight - 64;
      cssW = Math.max(240, Math.min(availW, availH / aspect, 1400));
      canvas.style.width = Math.round(cssW) + 'px';
    } else {
      cssW = Math.max(200, Math.min(420, canvas.clientWidth || canvas.parentElement.clientWidth - 28));
      canvas.style.width = '';
    }
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
  // Blok jest zasilony skądinąd. Ważne: sprawdzamy to wg stanu Bloku z
  // POPRZEDNIEGO ticku (rsBlockPoweredPrev), nie bieżącego — dzięki temu pętla
  // zwrotna (pochodnia zasilająca przez przewód własny blok) nie zapętla się w
  // nieskończoność w jednym ticku, tylko mruga raz na tick, dokładnie jak
  // prawdziwy "torch clock" w Minecrafcie. Symulacja tyka niezależnie od pętli
  // rAF renderu (setInterval) — inny rytm niż płynna kamera/wejście.
  const RS_TICK_MS = 100;
  const RS_REPEATER_DELAY = 1;   // ticki
  const RS_BUTTON_TICKS = 10;    // ~1s przy 10 tickach/s
  const RS_MIN_SCALE = 14, RS_MAX_SCALE = 64; // px na komórkę
  const RS_ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const RS_DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // rotation 0=E,1=S,2=W,3=N (kierunek WYJŚCIA przekaźnika)
  const RS_WIRE_OFF = [74, 20, 20], RS_WIRE_ON = [255, 107, 26];

  let rsWorld = new Map();              // "x,y" -> {type, rotation?, torch?, on?} (ZAPISYWANE)
  let rsCamera = { x: 0, y: 0, scale: 28 }; // (ZAPISYWANE razem ze światem)
  let rsTool = 'select';
  let rsTick = 0;
  let rsBlockPoweredPrev = new Map();   // ulotne — stan Bloków z poprzedniego ticku
  let rsScheduledRepeaters = new Map(); // ulotne — key -> { dueTick }
  let rsButtonActive = new Map();       // ulotne — key -> tick do którego przycisk aktywny
  let rsLastPower = new Map();          // ulotne, tylko do rysowania
  let rsSimTimer = 0;
  let rsSaveT = 0;
  let rsW = 0, rsH = 0;

  const rsKey = (x, y) => x + ',' + y;
  const rsParseKey = (key) => { const p = key.split(','); return [parseInt(p[0], 10), parseInt(p[1], 10)]; };
  const rsNeighbors = (x, y) => RS_ORTHO.map(([dx, dy]) => [x + dx, y + dy]);
  const rsRepeaterOut = (x, y, rot) => { const d = RS_DIR[rot]; return [x + d[0], y + d[1]]; };
  const rsRepeaterIn = (x, y, rot) => { const d = RS_DIR[(rot + 2) % 4]; return [x + d[0], y + d[1]]; };

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
    rsBlockPoweredPrev = new Map();
    rsScheduledRepeaters = new Map();
    rsButtonActive = new Map();
    rsLastPower = new Map();
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
    if (tool === 'repeater') return { type: 'repeater', rotation: 0 };
    if (tool === 'lever') return { type: 'lever', on: false };
    if (tool === 'block') return { type: 'block', torch: false };
    return { type: tool }; // wire, button, lamp
  }

  function rsUpdateBestFromSize() {
    if (rsWorld.size > getBest('redstone')) {
      setBest('redstone', rsWorld.size);
      setBestLabel(rsWorld.size);
    }
  }

  // Dotknięcie komórki (cx,cy) — zachowanie zależy od wybranego narzędzia:
  // - "select": obraca przekaźnik / przełącza dźwignię / naciska przycisk;
  //   blok/przewód/pochodnia/lampa — nic (brak akcji do wykonania na nich).
  // - "torch": WYJĄTEK od "zajęte pole = nic" — dotyka istniejącego Bloku bez
  //   pochodni i ją dołącza (2D-owy odpowiednik "postaw pochodnię na bloku").
  // - "eraser": usuwa cokolwiek stoi na polu.
  // - inne narzędzie: stawia nowy klocek na PUSTYM polu (zajęte = nic, najpierw
  //   trzeba wymazać).
  function rsHandleTap(cx, cy) {
    const key = rsKey(cx, cy);
    const cell = rsWorld.get(key);
    if (rsTool === 'select') {
      if (!cell) return;
      if (cell.type === 'repeater') cell.rotation = (cell.rotation + 1) % 4;
      else if (cell.type === 'lever') cell.on = !cell.on;
      else if (cell.type === 'button') rsButtonActive.set(key, rsTick + RS_BUTTON_TICKS);
      else return;
    } else if (rsTool === 'eraser') {
      if (!cell) return;
      rsWorld.delete(key);
      rsScheduledRepeaters.delete(key);
      rsButtonActive.delete(key);
    } else if (rsTool === 'torch') {
      if (cell && cell.type === 'block' && !cell.torch) cell.torch = true;
      else return;
    } else {
      if (cell) return;
      rsWorld.set(key, rsDefaultCell(rsTool));
    }
    rsUpdateBestFromSize();
    rsScheduleSave();
  }

  // ── Symulacja (setInterval, ~10 ticków/s, niezależna od rAF renderu) ──
  function rsTick_() {
    rsTick++;

    // 1) Przekaźniki zaplanowane w poprzednich tickach odpalają teraz —
    //    kierunkowe wstrzyknięcie sygnału TYLKO w pole wyjściowe (nie dookoła).
    const directedInjections = [];
    for (const [key, sched] of rsScheduledRepeaters) {
      if (sched.dueTick <= rsTick) {
        const cell = rsWorld.get(key);
        if (cell && cell.type === 'repeater') {
          const [x, y] = rsParseKey(key);
          directedInjections.push(rsKey(...rsRepeaterOut(x, y, cell.rotation)));
        }
        rsScheduledRepeaters.delete(key);
      }
    }

    // 2) Źródła wszechkierunkowe: pochodnie (wg stanu Bloku z POPRZEDNIEGO
    //    ticku — to jest ten 1-tickowy lag łamiący pętlę zwrotną), dźwignie
    //    włączone, przyciski wciąż aktywne.
    const omniSources = [];
    for (const [key, cell] of rsWorld) {
      if (cell.type === 'block' && cell.torch && !rsBlockPoweredPrev.get(key)) omniSources.push(key);
      else if (cell.type === 'lever' && cell.on) omniSources.push(key);
      else if (cell.type === 'button' && (rsButtonActive.get(key) || 0) > rsTick) omniSources.push(key);
    }

    // 3) Wielo-źródłowy BFS z zanikiem (kubełki wg siły 15→1). Każda komórka
    //    przyjmuje tylko NAJSILNIEJSZY sygnał jaki do niej dotarł i to wystarczy
    //    — klasyczne "shortest path z zanikiem", jeden przebieg, bez pętli.
    //    Dalej propagują TYLKO przewody (wire) — blok/lampa/przekaźnik/dźwignia/
    //    przycisk to zawsze ślepy zaułek (stąd brak przewodzenia przez blok i
    //    brak "przecieku" z wyjścia przekaźnika na jego wejście).
    const power = new Map();
    const buckets = Array.from({ length: 16 }, () => []);
    const relayInto = (pos, level) => {
      if (level <= 0) return;
      const c = rsWorld.get(pos);
      if (!c) return;
      if ((power.get(pos) || 0) >= level) return;
      power.set(pos, level);
      if (c.type === 'wire') buckets[level].push(pos);
    };
    for (const key of omniSources) {
      const [x, y] = rsParseKey(key);
      for (const [nx, ny] of rsNeighbors(x, y)) relayInto(rsKey(nx, ny), 15);
    }
    for (const pos of directedInjections) relayInto(pos, 15);
    for (let lvl = 15; lvl >= 1; lvl--) {
      for (const pos of buckets[lvl]) {
        if (power.get(pos) !== lvl) continue; // wpis nieaktualny, ktoś już nadpisał mocniejszym
        const [x, y] = rsParseKey(pos);
        for (const [nx, ny] of rsNeighbors(x, y)) relayInto(rsKey(nx, ny), lvl - 1);
      }
    }

    // 4) Przekaźniki: sprawdź TYLKO pole od strony wejścia (rotation+180°) —
    //    to właśnie ta jednostronność daje efekt diody (blokada przepływu
    //    zwrotnego z wyjścia). Jeśli zasilone i jeszcze nic nie zaplanowano,
    //    zaplanuj wyjście na kolejny tick (ciągłe zasilanie = ciągłe odpalanie
    //    co tick, z 1-tickowym opóźnieniem, jak prawdziwy przekaźnik).
    for (const [key, cell] of rsWorld) {
      if (cell.type !== 'repeater') continue;
      const [x, y] = rsParseKey(key);
      const inKey = rsKey(...rsRepeaterIn(x, y, cell.rotation));
      if ((power.get(inKey) || 0) > 0 && !rsScheduledRepeaters.has(key)) {
        rsScheduledRepeaters.set(key, { dueTick: rsTick + RS_REPEATER_DELAY });
      }
    }

    // 5) Zapisz stan zasilenia Bloków z TEGO ticku — użyje go dopiero
    //    NASTĘPNY tick przy sprawdzaniu pochodni (patrz komentarz na górze).
    const nextBlockPowered = new Map();
    for (const [key, cell] of rsWorld) {
      if (cell.type === 'block') nextBlockPowered.set(key, (power.get(key) || 0) > 0);
    }
    rsBlockPoweredPrev = nextBlockPowered;
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
  function rsBuildToolbar() {
    const el = $('games-toolbar');
    if (!el) return;
    el.style.display = 'flex';
    const tools = ['select', 'block', 'wire', 'torch', 'repeater', 'lever', 'button', 'lamp', 'eraser'];
    const labelKeys = { select: 'rsToolSelect', block: 'rsToolBlock', wire: 'rsToolWire', torch: 'rsToolTorch',
      repeater: 'rsToolRepeater', lever: 'rsToolLever', button: 'rsToolButton', lamp: 'rsToolLamp', eraser: 'rsToolEraser' };
    el.innerHTML = tools.map((id) =>
      `<button class="btn-secondary btn-sm${rsTool === id ? ' is-active' : ''}" data-rs-tool="${id}">${t(labelKeys[id])}</button>`
    ).join('') + `<button class="btn-secondary btn-sm" data-rs-clear="1">${t('rsClearWorld')}</button>`;

    el.querySelectorAll('button[data-rs-tool]').forEach((b) => {
      b.onclick = () => {
        rsTool = b.getAttribute('data-rs-tool');
        el.querySelectorAll('button[data-rs-tool]').forEach((x) => x.classList.toggle('is-active', x === b));
      };
    });
    const clearBtn = el.querySelector('button[data-rs-clear]');
    if (clearBtn) clearBtn.onclick = async () => {
      if (!(await confirmDialog(t('rsConfirmClear'), t('rsConfirmClearOk')))) return;
      rsWorld = new Map();
      rsScheduledRepeaters = new Map();
      rsButtonActive = new Map();
      rsBlockPoweredPrev = new Map();
      rsLastPower = new Map();
      setScore(0);
      rsScheduleSave();
    };
  }

  // ── Rysowanie (kolory/kształty wektorowe — brak grafik, czytelność przede
  // wszystkim: jasność przewodu = aktualna siła sygnału, jak w prawdziwym MC) ──
  function rsLerpColor(c1, c2, tt) {
    return `rgb(${Math.round(c1[0] + (c2[0] - c1[0]) * tt)},${Math.round(c1[1] + (c2[1] - c1[1]) * tt)},${Math.round(c1[2] + (c2[2] - c1[2]) * tt)})`;
  }

  function rsDrawGrid(ctx, W, H) {
    ctx.fillStyle = cssVar('--bg3', '#1e2029');
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
    ctx.fillStyle = cssVar('--border', '#2a2d3a');
    ctx.fillRect(sx + 1, sy + 1, s - 2, s - 2);
    if (cell.torch) {
      const on = !rsBlockPoweredPrev.get(key);
      ctx.fillStyle = on ? '#ff6b1a' : '#4a2a1a';
      ctx.fillRect(sx + s / 2 - s * 0.07, sy + s * 0.2, s * 0.14, s * 0.5);
      if (on) {
        ctx.fillStyle = '#ffcf4d';
        ctx.beginPath(); ctx.arc(sx + s / 2, sy + s * 0.18, s * 0.09, 0, Math.PI * 2); ctx.fill();
      }
    }
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

  function rsDrawRepeater(ctx, sx, sy, s, cell, key) {
    ctx.fillStyle = cssVar('--bg3', '#1e2029');
    ctx.fillRect(sx + s * 0.1, sy + s * 0.1, s * 0.8, s * 0.8);
    ctx.strokeStyle = cssVar('--border', '#2a2d3a');
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + s * 0.1, sy + s * 0.1, s * 0.8, s * 0.8);
    const active = rsScheduledRepeaters.has(key);
    ctx.fillStyle = active ? '#ff6b1a' : '#8a8fa8';
    const d = RS_DIR[cell.rotation];
    const cx = sx + s / 2, cy = sy + s / 2;
    ctx.beginPath(); ctx.arc(cx + d[0] * s * 0.22, cy + d[1] * s * 0.22, s * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - d[0] * s * 0.22, cy - d[1] * s * 0.22, s * 0.09, 0, Math.PI * 2); ctx.fill();
  }

  function rsDrawLever(ctx, sx, sy, s, cell) {
    ctx.fillStyle = cssVar('--border', '#2a2d3a');
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
    ctx.fillStyle = cssVar('--border', '#2a2d3a');
    ctx.fillRect(sx + s * 0.25, sy + s * 0.4, s * 0.5, s * 0.2);
    ctx.fillStyle = active ? '#ff6b1a' : '#8a8fa8';
    ctx.fillRect(sx + s * 0.35, sy + (active ? s * 0.42 : s * 0.36), s * 0.3, s * 0.12);
  }

  function rsDrawLamp(ctx, sx, sy, s, key) {
    const lit = (rsLastPower.get(key) || 0) > 0;
    ctx.fillStyle = lit ? '#fff3c0' : '#3a3d4d';
    ctx.beginPath(); ctx.arc(sx + s / 2, sy + s / 2, s * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = cssVar('--border', '#2a2d3a');
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function rsDrawCell(ctx, x, y, cell, key) {
    const { sx, sy } = rsWorldToScreen(x, y);
    const s = rsCamera.scale;
    if (cell.type === 'block') rsDrawBlock(ctx, sx, sy, s, cell, key);
    else if (cell.type === 'wire') rsDrawWire(ctx, sx, sy, s, x, y, key);
    else if (cell.type === 'repeater') rsDrawRepeater(ctx, sx, sy, s, cell, key);
    else if (cell.type === 'lever') rsDrawLever(ctx, sx, sy, s, cell);
    else if (cell.type === 'button') rsDrawButton(ctx, sx, sy, s, key);
    else if (cell.type === 'lamp') rsDrawLamp(ctx, sx, sy, s, key);
  }

  function startRedstone() {
    const { canvas, ctx, W, H } = setupCanvas(1);
    rsW = W; rsH = H;
    rsTool = 'select';
    rsLoadWorld();
    rsBuildToolbar();
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
        const tb = $('games-toolbar');
        if (tb) { tb.innerHTML = ''; tb.style.display = 'none'; }
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
        blockPowered: Array.from(rsBlockPoweredPrev.entries()),
        scheduledRepeaters: Array.from(rsScheduledRepeaters.entries()),
        cells: Array.from(rsWorld.entries()),
      };
    },
  };
})();
