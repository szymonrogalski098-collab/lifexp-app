// LifeXP v2 Cloud Functions — codebase "lifexp-v2" (firebase.json).
//
// Deliberately empty for now. Planned exports (docs/v2/PLAN.md 6.9, 6.12):
//   exusTurn                               — stage 5b: one Gemini call per message
//   sendParentEmailCode, verifyParentEmailCode — stage 6: server-side parent verification
//
// The five v1 callables (aiClassifyIntent, aiAssistantChat, aiAssistantPing,
// aiConfirmTask, aiConfirmGoal) are deployed from source that no longer
// exists. They belong to a different codebase, so deploying this one never
// touches them. Deploy only with `npm run deploy` in this folder, which
// targets functions:lifexp-v2 — never a bare `firebase deploy --only functions`.
export {};
