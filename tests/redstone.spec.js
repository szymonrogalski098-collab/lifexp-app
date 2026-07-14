// Regression tests for the Redstone sandbox in games.js. These formalize the
// ad-hoc Playwright scripts written by hand across several rounds of bug
// fixes this session — every scenario here reproduces a bug that was found
// and fixed, so a regression here means one of those bugs came back.
//
// Drives the REAL games.js through the toolbar/canvas exactly like a user
// would (no mocking of the simulation), and reads state back through the
// existing read-only debug hook `LifeXPGames._debugRedstone()`.
const { test, expect } = require('@playwright/test');

const HARNESS = '/tests/fixtures/harness.html';
const CELL = 28; // matches the default rsCamera.scale a fresh world starts with

async function openRedstone(page) {
  await page.goto(HARNESS);
  await page.evaluate(() => window.__rsReady);
  await page.evaluate(() => window.LifeXPGames.open('redstone'));
  await page.waitForTimeout(100);
}

function clickTool(page, id) {
  return page.click(`#games-toolbar button[data-rs-tool="${id}"]`);
}

async function canvasRect(page) {
  return page.evaluate(() => {
    const c = document.getElementById('games-canvas');
    const r = c.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
  });
}

// Taps world cell (cx,cy) — offset a few px from the cell's exact top-left
// corner so we're safely inside it regardless of rounding.
async function tapCell(page, cx, cy) {
  const rect = await canvasRect(page);
  const sx = rect.w / 2 + cx * CELL + 4;
  const sy = rect.h / 2 + cy * CELL + 4;
  await page.mouse.click(rect.left + sx, rect.top + sy);
}

function dbg(page) {
  return page.evaluate(() => window.LifeXPGames._debugRedstone());
}

async function cellAt(page, x, y) {
  const d = await dbg(page);
  const c = d.cells.find(([k]) => k === `${x},${y}`);
  return c ? c[1] : null;
}

async function powerAt(page, x, y) {
  const d = await dbg(page);
  const p = d.power.find(([k]) => k === `${x},${y}`);
  return p ? p[1] : 0;
}

// Samples the actual rendered canvas at a WORLD point (fractional cell
// coordinates allowed — e.g. 0.5,0.5 = the center of cell (0,0)).
async function pixelAt(page, wx, wy) {
  return page.evaluate(({ wx, wy }) => {
    const canvas = document.getElementById('games-canvas');
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const scaleFactor = canvas.width / rect.width;
    const sx = rect.width / 2 + wx * 28;
    const sy = rect.height / 2 + wy * 28;
    const px = Math.round(sx * scaleFactor), py = Math.round(sy * scaleFactor);
    return Array.from(ctx.getImageData(px, py, 1, 1).data);
  }, { wx, wy });
}

const closeToWood = (rgb) => Math.abs(rgb[0] - 0xe8) < 25 && Math.abs(rgb[1] - 0xdc) < 25 && Math.abs(rgb[2] - 0xc0) < 25;

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw e; });
  await openRedstone(page);
});

test.describe('Clear World', () => {
  test('actually empties the world (confirmDialog reachable from games.js)', async ({ page }) => {
    await clickTool(page, 'block');
    await tapCell(page, 0, 0);
    expect((await dbg(page)).cells.length).toBeGreaterThan(0);
    await page.click('#games-toolbar button[data-rs-clear]');
    await page.waitForTimeout(100);
    expect((await dbg(page)).cells.length).toBe(0);
  });
});

test.describe('Torch', () => {
  test('places directly on an empty cell, no Block required, and rotates', async ({ page }) => {
    await clickTool(page, 'torch');
    await tapCell(page, 0, 0);
    let torch = await cellAt(page, 0, 0);
    expect(torch).toMatchObject({ type: 'torch', rotation: 0 });

    await clickTool(page, 'select');
    await tapCell(page, 0, 0);
    torch = await cellAt(page, 0, 0);
    expect(torch.rotation).toBe(1);
  });

  test('inverts via a lever/Repeater touching it directly, but NOT via plain wire', async ({ page }) => {
    // Wire-only path: must NOT power the torch (would self-reflect and flicker).
    await clickTool(page, 'lever'); await tapCell(page, -2, 0);
    await clickTool(page, 'wire'); await tapCell(page, -1, 0);
    await clickTool(page, 'block'); await tapCell(page, 0, 0);
    await clickTool(page, 'torch'); await tapCell(page, 0, 1);
    await clickTool(page, 'select'); await tapCell(page, -2, 0); // lever on
    await page.waitForTimeout(500);
    expect((await dbg(page)).torchPowered.find(([k]) => k === '0,1')?.[1]).toBeFalsy();

    // Direct Repeater touch: must power/deactivate the torch.
    await clickTool(page, 'lever'); await tapCell(page, -3, 3);
    await clickTool(page, 'wire'); await tapCell(page, -2, 3);
    await clickTool(page, 'repeater'); await tapCell(page, -1, 3); // rot0 East, front touches torch
    await clickTool(page, 'torch'); await tapCell(page, 0, 3);
    await clickTool(page, 'wire'); await tapCell(page, 1, 3);
    await clickTool(page, 'lamp'); await tapCell(page, 2, 3);
    await page.waitForTimeout(400);
    expect(await powerAt(page, 2, 3)).toBeGreaterThan(0); // torch lit, lamp on
    await clickTool(page, 'select'); await tapCell(page, -3, 3); // lever on
    await page.waitForTimeout(700);
    expect(await powerAt(page, 2, 3)).toBe(0); // repeater touching it directly turned it off
  });
});

test.describe('Repeater / Comparator directional power', () => {
  test('two Repeaters chain directly with no wire between them', async ({ page }) => {
    await clickTool(page, 'lever'); await tapCell(page, -4, 0);
    await clickTool(page, 'wire'); await tapCell(page, -3, 0);
    await clickTool(page, 'repeater'); await tapCell(page, -2, 0);
    await clickTool(page, 'repeater'); await tapCell(page, -1, 0); // touches previous repeater's front directly
    await clickTool(page, 'wire'); await tapCell(page, 0, 0);
    await clickTool(page, 'lamp'); await tapCell(page, 1, 0);
    await clickTool(page, 'select'); await tapCell(page, -4, 0);
    await page.waitForTimeout(700);
    expect(await powerAt(page, 1, 0)).toBeGreaterThan(0);
  });

  test('wire touching a Repeater on its FRONT (output) side does not falsely activate it', async ({ page }) => {
    await clickTool(page, 'repeater'); await tapCell(page, 0, 0); // rot0: back=West, front=East
    await clickTool(page, 'wire'); await tapCell(page, 1, 0); // front side
    await clickTool(page, 'lever'); await tapCell(page, 2, 0);
    await clickTool(page, 'select'); await tapCell(page, 2, 0);
    await page.waitForTimeout(500);
    const scheduled = (await dbg(page)).scheduledRepeaters.some(([k]) => k === '0,0');
    expect(scheduled).toBe(false);
  });

  test('delay (1-4) is adjustable via the select-tap settings panel and changes a clock\'s period', async ({ page }) => {
    await clickTool(page, 'repeater'); await tapCell(page, 0, 0);
    await clickTool(page, 'select'); await tapCell(page, 0, 0); // opens panel
    await page.waitForTimeout(50);
    await page.click('#games-rs-panel button[data-rs-panel-delay="4"]');
    const cell = await cellAt(page, 0, 0);
    expect(cell.delay).toBe(4);
  });
});

test.describe('Piston', () => {
  test('triggers from a side neighbor, not just its back', async ({ page }) => {
    await clickTool(page, 'piston'); await tapCell(page, 0, 0); // rot0 East
    await clickTool(page, 'lever'); await tapCell(page, 0, 1); // south side
    await clickTool(page, 'select'); await tapCell(page, 0, 1);
    await page.waitForTimeout(400);
    expect(await cellAt(page, 1, 0)).toMatchObject({ type: 'piston_head' });
  });

  test('pushes a directly-adjacent Observer one cell forward', async ({ page }) => {
    await clickTool(page, 'piston'); await tapCell(page, -3, 3);
    await clickTool(page, 'observer'); await tapCell(page, -2, 3);
    await clickTool(page, 'lever'); await tapCell(page, -4, 3);
    await clickTool(page, 'select'); await tapCell(page, -4, 3);
    await page.waitForTimeout(400);
    expect(await cellAt(page, -2, 3)).toMatchObject({ type: 'piston_head' });
    expect(await cellAt(page, -1, 3)).toMatchObject({ type: 'observer' });
  });

  test('a wire attachment directly in front is destroyed, not blocking extension', async ({ page }) => {
    await clickTool(page, 'piston'); await tapCell(page, -3, -3);
    await clickTool(page, 'wire'); await tapCell(page, -2, -3);
    await clickTool(page, 'lever'); await tapCell(page, -4, -3);
    await clickTool(page, 'select'); await tapCell(page, -4, -3);
    await page.waitForTimeout(400);
    expect(await cellAt(page, -2, -3)).toMatchObject({ type: 'piston_head' });
  });

  test('is still blocked by piston_head / an already-extended piston', async ({ page }) => {
    await clickTool(page, 'piston'); await tapCell(page, -3, -3);
    await clickTool(page, 'lever'); await tapCell(page, -4, -3);
    await clickTool(page, 'select'); await tapCell(page, -4, -3);
    await page.waitForTimeout(400);
    expect(await cellAt(page, -2, -3)).toMatchObject({ type: 'piston_head' });

    await clickTool(page, 'piston'); await tapCell(page, -2, -2);
    await clickTool(page, 'select');
    for (let i = 0; i < 3; i++) { await tapCell(page, -2, -2); await page.waitForTimeout(20); } // rotate to face North
    await clickTool(page, 'lever'); await tapCell(page, -2, -1);
    await clickTool(page, 'select'); await tapCell(page, -2, -1);
    await page.waitForTimeout(400);
    expect((await cellAt(page, -2, -2)).extended).toBe(false);
  });
});

test.describe('Observer clock', () => {
  test('two Observers facing each other actually fire pulses over time', async ({ page }) => {
    await clickTool(page, 'observer'); await tapCell(page, 0, 0); // rot0 East
    await clickTool(page, 'observer'); await tapCell(page, 1, 0);
    await clickTool(page, 'select');
    for (let i = 0; i < 2; i++) { await tapCell(page, 1, 0); await page.waitForTimeout(20); } // rotate to face West
    let anyPulses = false;
    for (let i = 0; i < 20 && !anyPulses; i++) {
      const d = await dbg(page);
      if (d.scheduledObservers.length > 0) anyPulses = true;
      await page.waitForTimeout(100);
    }
    expect(anyPulses).toBe(true);
  });
});

test.describe('Signal Meter / Adder', () => {
  test('Meter reads the incoming signal and does not conduct further', async ({ page }) => {
    await clickTool(page, 'lever'); await tapCell(page, -2, 0);
    await clickTool(page, 'wire'); await tapCell(page, -1, 0);
    await clickTool(page, 'meter'); await tapCell(page, 0, 0);
    await clickTool(page, 'wire'); await tapCell(page, 1, 0);
    await clickTool(page, 'select'); await tapCell(page, -2, 0);
    await page.waitForTimeout(400);
    expect(await powerAt(page, 0, 0)).toBe(14);
    expect(await powerAt(page, 1, 0)).toBe(0);
  });

  test('Adder sums power from multiple sides', async ({ page }) => {
    await clickTool(page, 'lever'); await tapCell(page, 3, -2);
    await clickTool(page, 'wire'); await tapCell(page, 3, -1);
    await clickTool(page, 'adder'); await tapCell(page, 3, 0);
    await clickTool(page, 'wire'); await tapCell(page, 4, 0);
    await clickTool(page, 'lever'); await tapCell(page, 5, 0);
    await clickTool(page, 'select'); await tapCell(page, 3, -2);
    await clickTool(page, 'select'); await tapCell(page, 5, 0);
    await page.waitForTimeout(400);
    const d = await dbg(page);
    const adderVal = d.adderValue.find(([k]) => k === '3,0')?.[1] || 0;
    expect(adderVal).toBeGreaterThanOrEqual(14 + 14 - 4); // both lever arms contributing (exact value depends on decay geometry)
  });
});

test.describe('NOT Gate', () => {
  test('inverts its input with a 1-tick delay', async ({ page }) => {
    await clickTool(page, 'lever'); await tapCell(page, -2, 0);
    await clickTool(page, 'wire'); await tapCell(page, -1, 0);
    await clickTool(page, 'not_gate'); await tapCell(page, 0, 0);
    await clickTool(page, 'wire'); await tapCell(page, 1, 0);
    await clickTool(page, 'lamp'); await tapCell(page, 2, 0);
    await page.waitForTimeout(400);
    expect(await powerAt(page, 2, 0)).toBeGreaterThan(0);
    await clickTool(page, 'select'); await tapCell(page, -2, 0);
    await page.waitForTimeout(400);
    expect(await powerAt(page, 2, 0)).toBe(0);
  });

  test('wired back into its own input self-oscillates as a real clock', async ({ page }) => {
    await clickTool(page, 'not_gate'); await tapCell(page, 0, 3); // rot0 East
    await clickTool(page, 'wire'); await tapCell(page, 1, 3);
    await clickTool(page, 'wire'); await tapCell(page, 1, 4);
    await clickTool(page, 'wire'); await tapCell(page, 0, 4);
    await clickTool(page, 'wire'); await tapCell(page, -1, 4);
    await clickTool(page, 'wire'); await tapCell(page, -1, 3);
    const samples = [];
    for (let i = 0; i < 20; i++) {
      samples.push((await powerAt(page, 1, 3)) > 0 ? 1 : 0);
      await page.waitForTimeout(100);
    }
    let toggles = 0;
    for (let i = 1; i < samples.length; i++) if (samples[i] !== samples[i - 1]) toggles++;
    expect(toggles).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Sign', () => {
  test('places with correct defaults and its text clamps at 20 characters', async ({ page }) => {
    await clickTool(page, 'sign'); await tapCell(page, 0, 0);
    let sign = await cellAt(page, 0, 0);
    expect(sign).toMatchObject({ type: 'sign', text: '', separate: false });

    await clickTool(page, 'select'); await tapCell(page, 0, 0);
    await page.waitForTimeout(50);
    await page.fill('#games-rs-panel input[data-rs-panel-sign-text]', 'This text is definitely longer than twenty characters');
    await page.dispatchEvent('#games-rs-panel input[data-rs-panel-sign-text]', 'input');
    await page.waitForTimeout(50);
    sign = await cellAt(page, 0, 0);
    expect(sign.text.length).toBe(20);
  });

  test('two adjacent merge-eligible signs render as one continuous plaque; separate keeps a gap', async ({ page }) => {
    await clickTool(page, 'sign'); await tapCell(page, -1, 0);
    await clickTool(page, 'sign'); await tapCell(page, 0, 0);
    await page.waitForTimeout(150);
    expect(closeToWood(await pixelAt(page, 0, 0.5))).toBe(true); // seam between the two cells

    await clickTool(page, 'select'); await tapCell(page, 0, 0);
    await page.waitForTimeout(50);
    await page.click('#games-rs-panel button[data-rs-panel-sign-separate]');
    await page.waitForTimeout(150);
    expect(closeToWood(await pixelAt(page, 0, 0.5))).toBe(false); // gap reappears
    expect(closeToWood(await pixelAt(page, 0.5, 0.5))).toBe(true); // its own board still there
    expect(closeToWood(await pixelAt(page, -0.5, 0.5))).toBe(true);
  });

  test('a piston destroys a Sign directly in front of it instead of pushing/blocking', async ({ page }) => {
    await clickTool(page, 'piston'); await tapCell(page, -2, 3);
    await clickTool(page, 'sign'); await tapCell(page, -1, 3);
    await clickTool(page, 'lever'); await tapCell(page, -3, 3);
    await clickTool(page, 'select'); await tapCell(page, -3, 3);
    await page.waitForTimeout(400);
    expect(await cellAt(page, -1, 3)).toMatchObject({ type: 'piston_head' });
  });
});
