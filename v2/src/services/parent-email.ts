// The parent's e-mail and the weekly report (v1 settings.js; stage 4g). The code is
// sent first and saved after: v1 saves it first, so a failed send left "code sent"
// on screen with nothing in the inbox.
import { sendParentCodeEmail } from '@/data/emailjs';
import {
  cancelParentEmailVerification,
  confirmParentEmail,
  readParentCode,
  setAutoReport,
  startParentEmailVerification,
} from '@/data/repos/profile';
import { newParentCode, parentCodeProblem, parentEmailProblem, PARENT_CODE_TTL_MS, type CodeProblem } from '@/domain/parent-email';

export type SendProblem = 'invalid' | 'sendFailed';

/** v1 sendParentEmailVerification(). Resolves once the code is on its way and saved. */
export async function sendParentCode(uid: string, userName: string, email: string, now = Date.now()): Promise<SendProblem | null> {
  if (parentEmailProblem(email)) return 'invalid';
  const address = email.trim();
  const code = newParentCode();
  try {
    await sendParentCodeEmail(address, userName, code);
  } catch {
    return 'sendFailed';
  }
  await startParentEmailVerification(uid, address, code, now + PARENT_CODE_TTL_MS);
  return null;
}

/** v1 verifyParentEmailCode(): checked against the server's copy, then the address counts. */
export async function verifyParentCode(uid: string, input: string, now = new Date()): Promise<CodeProblem | null> {
  const stored = await readParentCode(uid);
  const problem = parentCodeProblem(input, stored, now.getTime());
  if (problem) return problem;
  await confirmParentEmail(uid, stored.pendingParentEmail!, now);
  return null;
}

export function cancelParentCode(uid: string): Promise<void> {
  return cancelParentEmailVerification(uid);
}

export function saveAutoReport(uid: string, on: boolean): Promise<void> {
  return setAutoReport(uid, on);
}
