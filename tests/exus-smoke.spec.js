const { test, expect } = require('@playwright/test');

// Drives tests/fixtures/exus-harness.html, which inlines the EXACT CSS/HTML/JS
// extracted from app.html for the Siri-ous/Ex-us toggle (see that file's header
// comment for why: app.html's real module script imports Firebase directly from
// gstatic.com, which this sandbox's egress policy blocks, so the full app can't
// boot here). httpsCallable/functions are stubbed via window.__exusMock.

test('Ex-us chat UI: structure, toggle, theme reactivity, send flow', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });
  await page.goto('/tests/fixtures/exus-harness.html');
  await page.waitForTimeout(200);

  const structure = await page.evaluate(() => ({
    hasSwitchToggle: !!document.querySelector('.aichat-switch'),
    siriPill: !!document.getElementById('aichat-pill-siri'),
    exusPill: !!document.getElementById('aichat-pill-exus'),
    aicShell: !!document.getElementById('aic-shell'),
    exusShell: !!document.getElementById('exus-shell'),
    hasSwitchFn: typeof window.switchAiAssistant,
    hasSendFn: typeof window.sendExusMessage,
  }));
  expect(structure).toEqual({
    hasSwitchToggle: true, siriPill: true, exusPill: true,
    aicShell: true, exusShell: true,
    hasSwitchFn: 'function', hasSendFn: 'function',
  });

  // Initial state: Siri-ous visible, Ex-us hidden, Siri pill active.
  const initial = await page.evaluate(() => ({
    aicDisplay: getComputedStyle(document.getElementById('aic-shell')).display,
    exusDisplay: getComputedStyle(document.getElementById('exus-shell')).display,
    siriActive: document.getElementById('aichat-pill-siri').classList.contains('active'),
    exusActive: document.getElementById('aichat-pill-exus').classList.contains('active'),
  }));
  expect(initial.exusDisplay).toBe('none');
  expect(initial.siriActive).toBe(true);
  expect(initial.exusActive).toBe(false);

  // Click the collapsed "E" pill -> Ex-us panel takes over, Siri-ous hides.
  await page.click('#aichat-pill-exus');
  await page.waitForTimeout(100);
  const afterClick = await page.evaluate(() => ({
    aicDisplay: getComputedStyle(document.getElementById('aic-shell')).display,
    exusDisplay: getComputedStyle(document.getElementById('exus-shell')).display,
    siriActive: document.getElementById('aichat-pill-siri').classList.contains('active'),
    exusActive: document.getElementById('aichat-pill-exus').classList.contains('active'),
    exusBg: getComputedStyle(document.getElementById('exus-shell')).backgroundColor,
  }));
  expect(afterClick.aicDisplay).toBe('none');
  expect(afterClick.exusDisplay).toBe('flex');
  expect(afterClick.siriActive).toBe(false);
  expect(afterClick.exusActive).toBe(true);

  // Theme reactivity — the CRITICAL requirement: Ex-us colors must follow
  // the app's active theme via CSS custom properties, not hardcoded hex.
  const defaultBg = afterClick.exusBg;
  await page.evaluate(() => window.applyTheme('gold'));
  await page.waitForTimeout(100);
  const gold = await page.evaluate(() => ({
    bodyClass: document.body.className,
    exusBg: getComputedStyle(document.getElementById('exus-shell')).backgroundColor,
    fillBgImage: getComputedStyle(document.getElementById('exus-limit-fill')).backgroundImage,
  }));
  expect(gold.bodyClass).toContain('theme-gold');
  expect(gold.exusBg).not.toBe(defaultBg);

  await page.evaluate(() => window.applyTheme('apple'));
  await page.waitForTimeout(100);
  const apple = await page.evaluate(() => ({
    bodyClass: document.body.className,
    exusBg: getComputedStyle(document.getElementById('exus-shell')).backgroundColor,
  }));
  expect(apple.bodyClass).toContain('theme-apple');
  expect(apple.exusBg).not.toBe(gold.exusBg);
  expect(apple.exusBg).not.toBe(defaultBg);

  await page.evaluate(() => window.applyTheme('lifexp'));
  await page.waitForTimeout(100);
  const backToDefault = await page.evaluate(() =>
    getComputedStyle(document.getElementById('exus-shell')).backgroundColor);
  expect(backToDefault).toBe(defaultBg);

  // Send flow — success path: mock aiAssistantPing response, verify the
  // limit bar picks up real tokensUsedToday/tokensLimitDaily/remainingPercent.
  await page.evaluate(() => {
    window.__exusMock = {
      mode: 'success',
      data: { status: 'ok', tokensUsedToday: 850, tokensLimitDaily: 1000, remainingPercent: 15, modelWouldBe: 'gemini-1.5-flash' },
    };
  });
  await page.fill('#exus-input', 'Cześć Ex-us');
  await page.click('.exus-send');
  await page.waitForTimeout(150);

  const afterSuccess = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#exus-messages .exus-row'));
    return {
      rowCount: rows.length,
      userText: rows[0]?.querySelector('.exus-bubble')?.textContent,
      aiText: rows[1]?.querySelector('.exus-bubble')?.textContent,
      typingGone: !document.querySelector('.exus-typing'),
      fillWidth: document.getElementById('exus-limit-fill').style.width,
      pctText: document.getElementById('exus-limit-pct').textContent,
      subText: document.getElementById('exus-limit-sub').textContent,
      fillBg: document.getElementById('exus-limit-fill').style.background,
    };
  });
  expect(afterSuccess.rowCount).toBe(2);
  expect(afterSuccess.userText).toBe('Cześć Ex-us');
  expect(afterSuccess.aiText).toContain('gemini-1.5-flash');
  expect(afterSuccess.aiText).toContain('ok');
  expect(afterSuccess.typingGone).toBe(true);
  expect(afterSuccess.fillWidth).toBe('15%');
  expect(afterSuccess.pctText).toBe('15% pozostało');
  expect(afterSuccess.subText).toBe('850 / 1000 tokenów dziennie');
  // remainingPercent 15 < 20 -> warning color, not the accent gradient.
  expect(afterSuccess.fillBg).toContain('var(--warn)');

  // Send flow — error path: verify it doesn't throw and renders a bubble.
  await page.evaluate(() => {
    window.__exusMock = { mode: 'error', errorCode: 'functions/permission-denied', errorMessage: 'brak dostepu testowego' };
  });
  await page.fill('#exus-input', 'Druga wiadomosc');
  await page.click('.exus-send');
  await page.waitForTimeout(150);
  const afterError = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#exus-messages .exus-row'));
    return {
      rowCount: rows.length,
      lastText: rows[rows.length - 1]?.querySelector('.exus-bubble')?.textContent,
    };
  });
  expect(afterError.rowCount).toBe(4);
  expect(afterError.lastText).toContain('functions/permission-denied');
  expect(afterError.lastText).toContain('brak dostepu testowego');

  // History persists across a render (localStorage-backed).
  await page.reload();
  await page.waitForTimeout(200);
  const persisted = await page.evaluate(() =>
    document.querySelectorAll('#exus-messages .exus-row').length);
  expect(persisted).toBe(4);

  // Ignore incidental resource noise (e.g. a missing favicon on the static
  // test server) unrelated to the harness's own script.
  const unexpected = errors.filter(e => !/Failed to load resource/.test(e));
  expect(unexpected).toEqual([]);
});
