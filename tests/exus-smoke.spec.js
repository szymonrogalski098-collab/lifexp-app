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

  // Fix-round requirements: the two pills touch (zero gap, one fused capsule)
  // and the switch sits flush directly on top of the chat card (its header).
  const layout = await page.evaluate(() => {
    const siri = document.getElementById('aichat-pill-siri').getBoundingClientRect();
    const exus = document.getElementById('aichat-pill-exus').getBoundingClientRect();
    const switchEl = document.querySelector('.aichat-switch').getBoundingClientRect();
    const shell = document.getElementById('aic-shell').getBoundingClientRect();
    return {
      pillGap: exus.left - siri.right,
      switchToShellGap: shell.top - switchEl.bottom,
    };
  });
  expect(layout.pillGap).toBe(0);
  expect(layout.switchToShellGap).toBeLessThanOrEqual(0); // flush or slightly overlapping, never a visible gap

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

  // Send flow — success path: aiAssistantChat returns a reply + a fresh
  // conversationId (first message of a new conversation, so no id was sent);
  // aiAssistantPing (called right after, to refresh the limit bar) returns
  // real usage numbers. Both calls are asserted for their actual arguments.
  await page.evaluate(() => {
    window.__exusMock.aiAssistantChat = {
      mode: 'success',
      data: (arg) => ({ status: 'ok', reply: 'Cześć! W czym mogę pomóc?', model: 'gemini-1.5-flash', tokensUsed: 42, conversationId: 'conv-abc123' }),
    };
    window.__exusMock.aiAssistantPing = {
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
      aiRole: rows[1]?.className,
      aiText: rows[1]?.querySelector('.exus-bubble')?.textContent,
      typingGone: !document.querySelector('.exus-typing'),
      fillWidth: document.getElementById('exus-limit-fill').style.width,
      pctText: document.getElementById('exus-limit-pct').textContent,
      subText: document.getElementById('exus-limit-sub').textContent,
      fillBg: document.getElementById('exus-limit-fill').style.background,
      // First call of a fresh conversation must NOT send a conversationId.
      chatArgSentNoConvId: !('conversationId' in (window.__exusMock.aiAssistantChat.lastArg || {})),
      exusConversationId: exusConversationId,
    };
  });
  expect(afterSuccess.rowCount).toBe(2);
  expect(afterSuccess.userText).toBe('Cześć Ex-us');
  expect(afterSuccess.aiRole).toBe('exus-row ai');
  expect(afterSuccess.aiText).toBe('Cześć! W czym mogę pomóc?');
  expect(afterSuccess.typingGone).toBe(true);
  expect(afterSuccess.chatArgSentNoConvId).toBe(true);
  expect(afterSuccess.exusConversationId).toBe('conv-abc123');
  expect(afterSuccess.fillWidth).toBe('15%');
  expect(afterSuccess.pctText).toBe('15% pozostało');
  expect(afterSuccess.subText).toBe('850 / 1000 tokenów dziennie');
  // remainingPercent 15 < 20 -> warning color, not the accent gradient.
  expect(afterSuccess.fillBg).toContain('var(--warn)');

  // Second message of the SAME conversation must send the stored conversationId.
  await page.evaluate(() => {
    window.__exusMock.aiAssistantChat.data = () => ({ status: 'ok', reply: 'Jasne, kontynuujmy.', model: 'gemini-1.5-flash', tokensUsed: 10, conversationId: 'conv-abc123' });
  });
  await page.fill('#exus-input', 'Kontynuacja');
  await page.click('.exus-send');
  await page.waitForTimeout(150);
  const secondArg = await page.evaluate(() => window.__exusMock.aiAssistantChat.lastArg);
  expect(secondArg).toEqual({ message: 'Kontynuacja', conversationId: 'conv-abc123' });

  // Send flow — error path: verify it doesn't throw, renders a distinct
  // "system" bubble (not a fake AI reply) with the backend's own message,
  // and the limit-bar ping still runs (independent try/catch).
  await page.evaluate(() => {
    window.__exusMock.aiAssistantChat = { mode: 'error', errorCode: 'functions/resource-exhausted', errorMessage: 'Dzienny limit tokenów wyczerpany.' };
  });
  await page.fill('#exus-input', 'Trzecia wiadomosc');
  await page.click('.exus-send');
  await page.waitForTimeout(150);
  const afterError = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#exus-messages .exus-row'));
    const last = rows[rows.length - 1];
    return {
      rowCount: rows.length,
      lastRole: last?.className,
      lastText: last?.querySelector('.exus-bubble')?.textContent,
      // conversationId from the LAST successful chat call must survive a failed one.
      exusConversationId: exusConversationId,
    };
  });
  expect(afterError.rowCount).toBe(6);
  expect(afterError.lastRole).toBe('exus-row system');
  expect(afterError.lastText).toBe('Dzienny limit tokenów wyczerpany.');
  expect(afterError.exusConversationId).toBe('conv-abc123');

  // "Nowa rozmowa" — clears visible history AND the stored conversationId.
  await page.click('.exus-newchat-btn');
  await page.waitForTimeout(100);
  const afterNewConvo = await page.evaluate(() => ({
    rowCount: document.querySelectorAll('#exus-messages .exus-row').length,
    hasEmptyState: !!document.querySelector('#exus-messages .exus-empty'),
    exusConversationId: exusConversationId,
  }));
  expect(afterNewConvo.rowCount).toBe(0);
  expect(afterNewConvo.hasEmptyState).toBe(true);
  expect(afterNewConvo.exusConversationId).toBe(null);

  // A message sent right after "Nowa rozmowa" must NOT send a conversationId
  // (fresh session), proving the reset actually took effect end-to-end.
  await page.evaluate(() => {
    window.__exusMock.aiAssistantChat = {
      mode: 'success',
      data: () => ({ status: 'ok', reply: 'Nowa rozmowa, nowe id.', model: 'gemini-1.5-flash', tokensUsed: 5, conversationId: 'conv-xyz789' }),
    };
  });
  await page.fill('#exus-input', 'Pierwsza wiadomosc nowej rozmowy');
  await page.click('.exus-send');
  await page.waitForTimeout(150);
  const freshConvo = await page.evaluate(() => ({
    sentNoConvId: !('conversationId' in (window.__exusMock.aiAssistantChat.lastArg || {})),
    exusConversationId: exusConversationId,
  }));
  expect(freshConvo.sentNoConvId).toBe(true);
  expect(freshConvo.exusConversationId).toBe('conv-xyz789');

  // History persists across a render (localStorage-backed) — 2 rows: the
  // fresh-conversation user message + its AI reply.
  await page.reload();
  await page.waitForTimeout(200);
  const persisted = await page.evaluate(() => ({
    rowCount: document.querySelectorAll('#exus-messages .exus-row').length,
    exusConversationId: exusConversationId,
  }));
  expect(persisted.rowCount).toBe(2);
  // conversationId also survives reload (localStorage-backed), so the next
  // message continues the same backend session instead of forking a new one.
  expect(persisted.exusConversationId).toBe('conv-xyz789');

  // Ignore incidental resource noise (e.g. a missing favicon on the static
  // test server) unrelated to the harness's own script.
  const unexpected = errors.filter(e => !/Failed to load resource/.test(e));
  expect(unexpected).toEqual([]);
});

test('Ex-us task proposals: aiProposeTask branch, confirm/reject, planner refresh', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });
  await page.goto('/tests/fixtures/exus-harness.html');
  await page.waitForTimeout(200);
  await page.click('#aichat-pill-exus');
  await page.waitForTimeout(100);

  // isTaskRequest:false -> the existing aiAssistantChat path must fire exactly
  // as before (this branch is required to stay unchanged).
  await page.evaluate(() => {
    window.__exusMock.aiProposeTask = { mode: 'success', data: { status: 'ok', isTaskRequest: false } };
    window.__exusMock.aiAssistantChat = { mode: 'success', data: () => ({ status: 'ok', reply: 'Zwykła odpowiedź.', model: 'gemini-1.5-flash', tokensUsed: 8, conversationId: 'conv-1' }) };
  });
  await page.fill('#exus-input', 'Jaka jest pogoda?');
  await page.click('.exus-send');
  await page.waitForTimeout(150);
  const normalPath = await page.evaluate(() => ({
    chatCalls: window.__exusMock.aiAssistantChat.calls,
    lastBubble: document.querySelector('#exus-messages .exus-row:last-of-type .exus-bubble')?.textContent,
  }));
  expect(normalPath.chatCalls).toBe(1);
  expect(normalPath.lastBubble).toBe('Zwykła odpowiedź.');

  // isTaskRequest:true -> a proposal CARD renders instead of a plain bubble,
  // and aiAssistantChat must NOT be called at all for this message.
  await page.evaluate(() => {
    window.__exusMock.aiProposeTask = {
      mode: 'success',
      data: {
        status: 'ok', isTaskRequest: true,
        proposal: { title: 'Nauka JS', time: '18:00', durationMin: 45, type: 'learning' },
      },
    };
  });
  const chatCallsBefore = await page.evaluate(() => window.__exusMock.aiAssistantChat.calls || 0);
  await page.fill('#exus-input', 'Dodaj mi naukę JS na 18:00 na 45 minut');
  await page.click('.exus-send');
  await page.waitForTimeout(150);

  const proposalState = await page.evaluate(() => {
    const card = document.querySelector('#exus-messages .exus-proposal');
    return {
      chatCallsAfter: window.__exusMock.aiAssistantChat.calls || 0,
      hasCard: !!card,
      title: card?.querySelector('.exus-proposal-title')?.textContent,
      metaText: card?.querySelector('.exus-proposal-meta')?.textContent,
      hasConfirmBtn: !!card?.querySelector('.exus-proposal-btn.confirm'),
      hasRejectBtn: !!card?.querySelector('.exus-proposal-btn.reject'),
    };
  });
  expect(proposalState.chatCallsAfter).toBe(chatCallsBefore); // NOT called
  expect(proposalState.hasCard).toBe(true);
  expect(proposalState.title).toBe('Nauka JS');
  expect(proposalState.metaText).toContain('18:00');
  expect(proposalState.metaText).toContain('45 min');
  // activityDefs is empty in this harness -> activityDefById falls back to
  // showing the raw id, exactly like the real app.html helper does.
  expect(proposalState.metaText).toContain('learning');
  expect(proposalState.hasConfirmBtn).toBe(true);
  expect(proposalState.hasRejectBtn).toBe(true);

  // Reject: no backend call, card turns into a plain text bubble, rejected
  // note is NOT styled as an error ("system" role).
  await page.click('.exus-proposal-btn.reject');
  await page.waitForTimeout(100);
  const afterReject = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#exus-messages .exus-row'));
    const last = rows[rows.length - 1];
    return {
      hasCardLeft: !!document.querySelector('#exus-messages .exus-proposal'),
      lastRole: last?.className,
      lastText: last?.querySelector('.exus-bubble')?.textContent,
      confirmCalls: window.__exusMock.aiConfirmTask.calls || 0,
    };
  });
  expect(afterReject.hasCardLeft).toBe(false);
  expect(afterReject.lastRole).toBe('exus-row ai');
  expect(afterReject.lastText).toBe('Dobrze, nie dodaję tego zadania.');
  expect(afterReject.confirmCalls).toBe(0);

  // Confirm flow, with the Planer dnia page CLOSED -> loadPlanner() must NOT fire.
  await page.evaluate(() => {
    window.__exusMock.aiProposeTask = {
      mode: 'success',
      data: {
        status: 'ok', isTaskRequest: true,
        proposal: { title: 'Trening', time: '07:30', durationMin: 30, type: 'exercise' },
      },
    };
    window.__exusMock.aiConfirmTask = { mode: 'success', data: { status: 'ok', taskId: 'task-99' } };
  });
  await page.fill('#exus-input', 'Zaplanuj mi trening jutro o 7:30 na 30 minut');
  await page.click('.exus-send');
  await page.waitForTimeout(150);
  await page.click('.exus-proposal-btn.confirm');
  await page.waitForTimeout(150);

  const afterConfirmClosed = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#exus-messages .exus-row'));
    const last = rows[rows.length - 1];
    return {
      confirmArg: window.__exusMock.aiConfirmTask.lastArg,
      hasCardLeft: !!document.querySelector('#exus-messages .exus-proposal'),
      lastRole: last?.className,
      lastText: last?.querySelector('.exus-bubble')?.textContent,
      loadPlannerCallCount: window.loadPlannerCallCount,
    };
  });
  // aiConfirmTask must receive EXACTLY the proposal fields, nothing more.
  expect(afterConfirmClosed.confirmArg).toEqual({ title: 'Trening', time: '07:30', durationMin: 30, type: 'exercise' });
  expect(afterConfirmClosed.hasCardLeft).toBe(false);
  expect(afterConfirmClosed.lastRole).toBe('exus-row ai');
  expect(afterConfirmClosed.lastText).toBe('Dodano zadanie: Trening o 07:30');
  expect(afterConfirmClosed.loadPlannerCallCount).toBe(0); // planner page wasn't open

  // Confirm flow, with the Planer dnia page OPEN -> loadPlanner() must fire.
  await page.evaluate(() => document.getElementById('page-planner').classList.add('active'));
  await page.evaluate(() => {
    window.__exusMock.aiProposeTask = {
      mode: 'success',
      data: {
        status: 'ok', isTaskRequest: true,
        proposal: { title: 'Czytanie', time: '20:00', durationMin: 20, type: 'reading' },
      },
    };
  });
  await page.fill('#exus-input', 'Dodaj czytanie o 20:00 na 20 minut');
  await page.click('.exus-send');
  await page.waitForTimeout(150);
  await page.click('.exus-proposal-btn.confirm');
  await page.waitForTimeout(150);
  const plannerRefreshed = await page.evaluate(() => window.loadPlannerCallCount);
  expect(plannerRefreshed).toBe(1);
  await page.evaluate(() => document.getElementById('page-planner').classList.remove('active'));

  // aiConfirmTask failure -> card stays pending (buttons re-enabled, can
  // retry) AND a separate "system" error bubble is appended below it,
  // same treatment as the existing aiAssistantChat error handling.
  await page.evaluate(() => {
    window.__exusMock.aiProposeTask = {
      mode: 'success',
      data: {
        status: 'ok', isTaskRequest: true,
        proposal: { title: 'Projekt', time: '10:00', durationMin: 60, type: 'project' },
      },
    };
    window.__exusMock.aiConfirmTask = { mode: 'error', errorCode: 'functions/internal', errorMessage: 'Nie udało się zapisać zadania.' };
  });
  await page.fill('#exus-input', 'Zaplanuj pracę nad projektem o 10 na godzinę');
  await page.click('.exus-send');
  await page.waitForTimeout(150);
  await page.click('.exus-proposal-btn.confirm');
  await page.waitForTimeout(150);
  const afterConfirmError = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#exus-messages .exus-row'));
    const last = rows[rows.length - 1];
    const card = document.querySelector('#exus-messages .exus-proposal');
    return {
      lastRole: last?.className,
      lastText: last?.querySelector('.exus-bubble')?.textContent,
      cardStillThere: !!card,
      confirmBtnEnabled: card ? !card.querySelector('.exus-proposal-btn.confirm').disabled : false,
    };
  });
  expect(afterConfirmError.lastRole).toBe('exus-row system');
  expect(afterConfirmError.lastText).toBe('Nie udało się zapisać zadania.');
  expect(afterConfirmError.cardStillThere).toBe(true);
  expect(afterConfirmError.confirmBtnEnabled).toBe(true);

  const unexpected = errors.filter(e => !/Failed to load resource/.test(e));
  expect(unexpected).toEqual([]);
});
