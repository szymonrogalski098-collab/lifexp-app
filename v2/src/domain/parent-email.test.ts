import { describe, expect, it } from 'vitest';
import { newParentCode, parentCodeProblem, parentEmailProblem, parentEmailState, PARENT_CODE_TTL_MS } from './parent-email';

describe('parentEmailState', () => {
  const none = { parentEmail: '', parentEmailVerifiedAt: null, pendingParentEmail: null };

  it('shows a pending code first, then a verified address, then one saved before verification', () => {
    expect(parentEmailState(none)).toEqual({ kind: 'none' });
    expect(parentEmailState({ ...none, pendingParentEmail: 'b@x.pl', parentEmail: 'a@x.pl', parentEmailVerifiedAt: 't' })).toEqual({
      kind: 'pending',
      email: 'b@x.pl',
    });
    expect(parentEmailState({ ...none, parentEmail: 'a@x.pl', parentEmailVerifiedAt: 't' })).toEqual({ kind: 'verified', email: 'a@x.pl' });
    expect(parentEmailState({ ...none, parentEmail: 'a@x.pl' })).toEqual({ kind: 'unverified', email: 'a@x.pl' });
  });
});

describe('parentEmailProblem', () => {
  it("takes what v1's pattern takes", () => {
    expect(parentEmailProblem(' mama@poczta.pl ')).toBeNull();
    expect(parentEmailProblem('mama@poczta')).toBe('invalid');
    expect(parentEmailProblem('')).toBe('invalid');
  });
});

describe('the code', () => {
  it('has six digits', () => {
    expect(newParentCode(() => 0)).toBe('100000');
    expect(newParentCode(() => 0.999999)).toBe('999999');
  });

  const stored = { pendingParentEmail: 'mama@poczta.pl', parentEmailCode: '123456', parentEmailCodeExpiry: 1_000 + PARENT_CODE_TTL_MS };

  it('is checked as v1 checks it: something pending, not expired, the same digits', () => {
    expect(parentCodeProblem('123456', { ...stored, parentEmailCode: null }, 1_000)).toBe('noPending');
    expect(parentCodeProblem('123456', { ...stored, pendingParentEmail: null }, 1_000)).toBe('noPending');
    expect(parentCodeProblem('123456', stored, 1_001 + PARENT_CODE_TTL_MS)).toBe('expired');
    expect(parentCodeProblem('654321', stored, 1_000)).toBe('invalid');
    expect(parentCodeProblem(' 123456 ', stored, 1_000 + PARENT_CODE_TTL_MS)).toBeNull();
  });
});
