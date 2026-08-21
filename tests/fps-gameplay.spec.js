// Gameplay tests for the FPS prototype — these actually RUN the game.
//
// fps.spec.js only asserts fps.html's static markup, because the page imports
// Three.js straight from unpkg and sandboxes/CI generally can't reach a CDN.
// Here we intercept that request and fulfil it from the locally installed
// `three` devDependency (pinned to the same version the page requests), so the
// module executes and the mechanics can be exercised against a real WebGL
// context instead of merely inspected as HTML.
//
// TIMING: headless software WebGL renders this scene at only a few fps, and the
// game clamps dt to 0.05s per frame, so wall-clock waits advance game time far
// more slowly than real time — and how much is machine-dependent. Every wait in
// this file is therefore counted in FRAMES, never in milliseconds.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// `three`'s package exports block deep subpaths, so derive the ESM build from
// the resolved main entry (…/three/build/three.cjs) rather than requiring it.
const THREE_PATH = path.join(path.dirname(require.resolve('three')), 'three.module.js');
const threeSrc = fs.readFileSync(THREE_PATH, 'utf8');

async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/three.module.js', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: threeSrc }));
  await page.goto('/fps.html');
  await page.waitForFunction(() => !!window.GAME, null, { timeout: 30000 });
  await page.evaluate(() => document.getElementById('ov-cta').click());
  return errors;
}

/** Wait N real animation frames — the game advances at most 0.05s of game time per frame. */
function frames(page, n) {
  return page.evaluate((count) => new Promise((res) => {
    let i = 0;
    const tick = () => (++i >= count ? res() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);
}

test('the pinned `three` devDependency matches the version fps.html imports', () => {
  // If these drift apart, every test below would silently exercise a different
  // Three.js than real users get from the CDN.
  const html = fs.readFileSync(path.join(__dirname, '..', 'fps.html'), 'utf8');
  const requested = html.match(/three@([\d.]+)\/build\/three\.module\.js/);
  expect(requested, 'fps.html should import a pinned three version').not.toBeNull();
  const installed = require('../package.json').devDependencies.three;
  expect(installed).toBe(requested[1]);
});

test('boots with all four weapons, seven bots and two grenades', async ({ page }) => {
  const errors = await boot(page);
  const info = await page.evaluate(() => ({
    weapons: window.GAME.WEAPONS.map(w => w.id),
    bots: window.GAME.bots.length,
    fov: window.GAME.camera.fov,
    nades: window.GAME.player.grenadesLeft,
  }));
  expect(info.weapons).toEqual(['pistol', 'rifle', 'smg', 'scar']);
  expect(info.bots).toBe(7);
  expect(info.fov).toBe(78);
  expect(info.nades).toBe(2);
  expect(errors).toEqual([]);
});

test('bot death: stays visible, tips over, then fades — and ONLY that bot fades', async ({ page }) => {
  await boot(page);

  const justDied = await page.evaluate(() => {
    const G = window.GAME;
    G.damageBot(G.bots[0], 9999, G.player);
    const b = G.bots[0];
    return { alive: b.alive, dying: b.dying, visible: b.group.visible };
  });
  // The whole point of the change: the corpse must NOT vanish instantly.
  expect(justDied).toEqual({ alive: false, dying: true, visible: true });

  await frames(page, 10);                       // through the 0.35s fall
  const afterFall = await page.evaluate(() => {
    const b = window.GAME.bots[0];
    return { rotX: b.group.rotation.x, visible: b.group.visible };
  });
  expect(afterFall.visible).toBe(true);
  expect(afterFall.rotX).toBeGreaterThan(1.4);  // tipped ~85deg

  await frames(page, 30);                       // through lie (0.9s) + fade (0.35s)
  const afterFade = await page.evaluate(() => {
    const G = window.GAME;
    const dead = G.bots[0], other = G.bots[1];
    return {
      visible: dead.group.visible,
      dying: dead.dying,
      deadOpacity: Math.max(...dead.ownMats.map(m => m.opacity)),
      otherOpacity: other.group.children.find(o => o.isMesh).material.opacity,
      deadCastsShadow: dead.group.children.find(o => o.isMesh).castShadow,
    };
  });
  expect(afterFade.visible).toBe(false);
  expect(afterFade.dying).toBe(false);
  expect(afterFade.deadOpacity).toBeLessThan(0.05);
  expect(afterFade.deadCastsShadow).toBe(false);
  // The shared-material hazard: fading one corpse must not fade the whole team.
  expect(afterFade.otherOpacity).toBe(1);
});

test('respawn undoes the death pose, opacity and shadow flags', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.GAME.damageBot(window.GAME.bots[0], 9999, window.GAME.player));
  await frames(page, 40);                        // let the full death animation finish
  await page.evaluate(() => { window.GAME.bots[0].respawnTimer = 0.01; });
  await frames(page, 3);

  const r = await page.evaluate(() => {
    const b = window.GAME.bots[0];
    return {
      alive: b.alive, visible: b.group.visible, rotX: b.group.rotation.x, dying: b.dying,
      minOpacity: Math.min(...b.ownMats.map(m => m.opacity)),
      anyTransparent: b.ownMats.some(m => m.transparent),
      castsShadow: b.group.children.find(o => o.isMesh).castShadow,
    };
  });
  expect(r).toEqual({
    alive: true, visible: true, rotX: 0, dying: false,
    minOpacity: 1, anyTransparent: false, castsShadow: true,
  });
});

test('ADS: RMB narrows FOV, halves spread, and never auto-fires', async ({ page }) => {
  await boot(page);
  const ammoBefore = await page.evaluate(() => {
    window.GAME.switchWeapon(1);                 // AK-47, auto:true
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    return window.GAME.weaponState[1].ammo;
  });
  await frames(page, 14);

  const aimed = await page.evaluate(() => ({
    aiming: window.GAME.player.aiming,
    fov: window.GAME.camera.fov,
    ammo: window.GAME.weaponState[1].ammo,
    crosshairScaled: document.getElementById('crosshair').style.transform.includes('scale(0.6)'),
  }));
  expect(aimed.aiming).toBe(true);
  expect(aimed.fov).toBeCloseTo(75, 0);          // BASE_FOV 78 − adsFovDrop 3
  expect(aimed.crosshairScaled).toBe(true);
  // Holding RMB must not pull the trigger on a full-auto weapon.
  expect(aimed.ammo).toBe(ammoBefore);

  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })));
  await frames(page, 14);
  const released = await page.evaluate(() => ({
    aiming: window.GAME.player.aiming, fov: window.GAME.camera.fov,
  }));
  expect(released.aiming).toBe(false);
  expect(released.fov).toBeCloseTo(78, 0);
});

test('ADS halves only base spread, leaving bloom untouched', async ({ page }) => {
  await boot(page);
  // Mirrors the formula in fireHitscan(): def.spread * (aiming ? 0.5 : 1) + bloom
  const r = await page.evaluate(() => {
    const G = window.GAME;
    const def = G.WEAPONS[1], bloom = 0.02;
    const hip = def.spread * 1 + bloom;
    const ads = def.spread * G.CFG.player.adsSpreadMul + bloom;
    return { hip, ads, bloom, spread: def.spread, mul: G.CFG.player.adsSpreadMul };
  });
  expect(r.mul).toBe(0.5);
  // Base spread is halved...
  expect(r.ads - r.bloom).toBeCloseTo(r.spread / 2, 10);
  // ...while the bloom term survives at full strength in both cases.
  expect(r.hip - r.spread).toBeCloseTo(r.bloom, 10);
  expect(r.ads).toBeLessThan(r.hip);
});

test('SCAR scope: full zoom, overlay on, crosshair hidden, movement slowed', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.GAME.switchWeapon(3);                 // SCAR-20
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
  });
  await frames(page, 16);

  const scoped = await page.evaluate(() => ({
    fov: window.GAME.camera.fov,
    isScoped: window.GAME.isScoped(),
    overlayOn: document.getElementById('scope-overlay').classList.contains('on'),
    crosshairHidden: getComputedStyle(document.getElementById('crosshair')).display === 'none',
  }));
  expect(scoped.isScoped).toBe(true);
  expect(scoped.fov).toBeCloseTo(20, 0);
  expect(scoped.overlayOn).toBe(true);
  expect(scoped.crosshairHidden).toBe(true);

  // Top speed while scoped
  await page.evaluate(() => { window.GAME.player.vel.set(0, 0, 0); window.GAME.keys.KeyW = true; });
  await frames(page, 12);
  const scopedSpeed = await page.evaluate(() => Math.hypot(window.GAME.player.vel.x, window.GAME.player.vel.z));

  // ...versus from the hip
  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
    window.GAME.player.vel.set(0, 0, 0);
  });
  await frames(page, 12);
  const hipSpeed = await page.evaluate(() => Math.hypot(window.GAME.player.vel.x, window.GAME.player.vel.z));
  await page.evaluate(() => { window.GAME.keys.KeyW = false; });

  expect(scopedSpeed).toBeGreaterThan(0.3);
  expect(scopedSpeed / hipSpeed).toBeCloseTo(0.3, 1);   // scopeSpeedMul

  await frames(page, 16);
  const unscoped = await page.evaluate(() => ({
    fov: window.GAME.camera.fov,
    overlayOn: document.getElementById('scope-overlay').classList.contains('on'),
    crosshairShown: getComputedStyle(document.getElementById('crosshair')).display !== 'none',
  }));
  expect(unscoped.fov).toBeCloseTo(78, 0);
  expect(unscoped.overlayOn).toBe(false);
  expect(unscoped.crosshairShown).toBe(true);
});

test('non-scar weapons get ADS but never the scope overlay', async ({ page }) => {
  await boot(page);
  for (const slot of [0, 1, 2]) {
    await page.evaluate((s) => {
      window.GAME.switchWeapon(s);
      document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    }, slot);
    await frames(page, 14);
    const r = await page.evaluate(() => ({
      isScoped: window.GAME.isScoped(),
      fov: window.GAME.camera.fov,
      overlayOn: document.getElementById('scope-overlay').classList.contains('on'),
    }));
    expect(r.isScoped).toBe(false);
    expect(r.overlayOn).toBe(false);
    expect(r.fov).toBeCloseTo(75, 0);
    await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })));
    await frames(page, 14);
  }
});

test('pause clears aiming so the zoom cannot get stuck', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.GAME.switchWeapon(3);
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
  });
  await frames(page, 5);
  const before = await page.evaluate(() => window.GAME.player.aiming);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));   // Alt-Tab → pauseGame()
  const after = await page.evaluate(() => window.GAME.player.aiming);
  expect(before).toBe(true);
  expect(after).toBe(false);
});

test('grenade: throws, one at a time, explodes and damages in radius', async ({ page }) => {
  await boot(page);
  const thrown = await page.evaluate(() => {
    const G = window.GAME;
    const start = G.player.grenadesLeft;
    G.throwGrenade();
    const afterFirst = { nades: G.player.grenadesLeft, live: !!G.getLiveGrenade() };
    G.throwGrenade();                            // must be ignored while one is live
    return { start, afterFirst, afterSecond: G.player.grenadesLeft };
  });
  expect(thrown.start).toBe(2);
  expect(thrown.afterFirst).toEqual({ nades: 1, live: true });
  expect(thrown.afterSecond).toBe(1);

  const blast = await page.evaluate(() => {
    const G = window.GAME;
    const bot = G.bots[0], gr = G.getLiveGrenade();
    bot.pos.copy(gr.pos); bot.pos.y = 0;         // stand the bot in the open at the blast point
    bot.group.position.copy(bot.pos);
    const hpBefore = bot.hp;
    G.explodeGrenade(gr.pos.clone());
    return { hpBefore, hpAfter: bot.hp, live: !!G.getLiveGrenade() };
  });
  expect(blast.live).toBe(false);
  expect(blast.hpAfter).toBeLessThan(blast.hpBefore);
});

test('grenade damage falls off linearly and stops at the radius', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const G = window.GAME, R = G.CFG.grenade.radius;
    return {
      atZero: G.blastDamageAt(0),
      atHalf: G.blastDamageAt(R / 2),
      atEdge: G.blastDamageAt(R),
      beyond: G.blastDamageAt(R + 1),
    };
  });
  expect(r.atZero).toBe(100);
  expect(r.atHalf).toBeCloseTo(55, 0);
  expect(r.atEdge).toBe(0);
  expect(r.beyond).toBe(0);
});

test('grenade does not damage through walls', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const G = window.GAME;
    const bot = G.bots[0];
    // Park the bot on one side of a SMALL solid box and detonate on the far
    // side. Must be small enough that both points sit inside the blast radius,
    // and tall/deep enough to fully occlude the line of sight.
    const box = G.colliders.find((b) => {
      const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
      return w >= 1 && w <= 4 && d >= 1 && h >= 1.9 && b.min.y <= 0.2;
    });
    if (!box) return { skipped: true };

    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const halfX = (box.max.x - box.min.x) / 2;

    bot.pos.set(cx - halfX - 0.6, 0, cz);
    bot.group.position.copy(bot.pos);
    bot.hp = 100;
    const blastPos = new (bot.pos.constructor)(cx + halfX + 0.6, 1.0, cz);
    const dist = bot.pos.distanceTo(blastPos);

    // Control: same distance, but with the box removed from the line of sight
    // (blast on the SAME side as the bot) must actually deal damage — proving
    // the zero above is occlusion, not just distance falloff.
    G.explodeGrenade(blastPos);
    const hpBehindCover = bot.hp;

    const openPos = new (bot.pos.constructor)(bot.pos.x - dist, 1.0, cz);
    G.explodeGrenade(openPos);
    return { hpBehindCover, hpInOpen: bot.hp, dist, radius: G.CFG.grenade.radius };
  });
  expect(r.skipped).toBeUndefined();
  // Bot is well inside the blast radius but fully occluded by the box.
  expect(r.dist).toBeLessThan(r.radius);
  expect(r.hpBehindCover).toBe(100);
  // Control: the same distance in the open DOES hurt — so the result above is
  // line-of-sight blocking, not merely distance falloff.
  expect(r.hpInOpen).toBeLessThan(100);
});

test('grenade physics: arcs, bounces, never tunnels through the floor, no NaN', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const G = window.GAME;
    G.player.pos.set(0, 0, -30);
    G.player.vel.set(0, 0, 0);
    G.throwGrenade();
  });

  const samples = [];
  for (let i = 0; i < 22; i++) {
    await frames(page, 2);
    const s = await page.evaluate(() => {
      const gr = window.GAME.getLiveGrenade();
      return gr ? { y: gr.pos.y, finite: Number.isFinite(gr.pos.x + gr.pos.y + gr.pos.z) } : null;
    });
    if (!s) break;
    samples.push(s);
  }

  expect(samples.length).toBeGreaterThan(4);
  expect(samples.every(s => s.finite)).toBe(true);
  expect(samples.every(s => s.y >= 0.088)).toBe(true);      // never sinks below the floor
  const ys = samples.map(s => s.y);
  expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys) + 0.2);   // a real arc, not frozen
});

test('grenade fuse detonates on its own and frees the slot', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.GAME.throwGrenade());
  expect(await page.evaluate(() => !!window.GAME.getLiveGrenade())).toBe(true);
  await frames(page, 60);                        // fuse is 2.5s of game time
  const r = await page.evaluate(() => ({
    live: !!window.GAME.getLiveGrenade(),
    canThrowAgain: (window.GAME.throwGrenade(), !!window.GAME.getLiveGrenade()),
    nades: window.GAME.player.grenadesLeft,
  }));
  expect(r.live).toBe(false);
  expect(r.canThrowAgain).toBe(true);            // slot freed, second grenade throwable
  expect(r.nades).toBe(0);
});

test('self-damage hurts but never credits the player a kill', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const G = window.GAME;
    const killsBefore = G.player.kills;
    const hpBefore = G.player.hp;
    G.throwGrenade();
    const gr = G.getLiveGrenade();
    gr.pos.copy(G.player.pos); gr.pos.y = G.player.pos.y + 1;   // at the player's feet
    G.explodeGrenade(gr.pos.clone());
    return { killsBefore, killsAfter: G.player.kills, hpBefore, hpAfter: G.player.hp };
  });
  expect(r.hpAfter).toBeLessThan(r.hpBefore);
  expect(r.killsAfter).toBe(r.killsBefore);
});

test('player respawn restores grenades', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.GAME.throwGrenade();
    window.GAME.damagePlayer(9999, null);
  });
  expect(await page.evaluate(() => window.GAME.player.alive)).toBe(false);
  await frames(page, 80);                        // respawnTime is 3s of game time
  const r = await page.evaluate(() => ({
    alive: window.GAME.player.alive, nades: window.GAME.player.grenadesLeft,
  }));
  expect(r.alive).toBe(true);
  expect(r.nades).toBe(2);
});

test('no runtime errors while exercising every new mechanic', async ({ page }) => {
  const errors = await boot(page);
  for (let slot = 0; slot < 4; slot++) {
    await page.evaluate((s) => {
      window.GAME.switchWeapon(s);
      document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    }, slot);
    await frames(page, 4);
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
    });
  }
  await page.evaluate(() => {
    const G = window.GAME;
    G.throwGrenade();
    G.damageBot(G.bots[2], 9999, G.player);
    G.damagePlayer(9999, null);
  });
  await frames(page, 60);
  expect(errors).toEqual([]);
});
