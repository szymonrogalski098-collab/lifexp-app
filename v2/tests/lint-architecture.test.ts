// The layering and markup rules in eslint.config.js are the project's
// guardrails (PLAN.md 4.2, 7.7). These cases prove each rule actually fires,
// so a config typo cannot silently switch one off.
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, test } from 'vitest';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) });

async function problems(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => `${m.ruleId ?? 'fatal'}: ${m.message}`);
}

const importing = (specifier: string) => `import { x } from '${specifier}';\nexport const y = x;\n`;

describe('layer boundaries', () => {
  test.each([
    ['src/domain/points.ts', '@/data/firebase'],
    ['src/domain/points.ts', '../data/firebase'],
    ['src/domain/rules/level.ts', '../../services/activity'],
    ['src/lib/dates.ts', '@/domain/streak'],
    ['src/ui/components/Card.tsx', '@/domain/points'],
    ['src/ui/components/Card.tsx', '@/stores/profile'],
    ['src/features/today/TodayPage.tsx', '@/data/repos/activities'],
    ['src/services/activity.ts', '@/features/today/TodayPage'],
    ['src/data/repos/activities.ts', '@/services/activity'],
  ])('%s cannot import %s', async (file, specifier) => {
    expect(await problems(file, importing(specifier))).toEqual([
      expect.stringMatching(/^no-restricted-imports: .*PLAN\.md 4\.2/),
    ]);
  });

  test.each([
    ['src/domain/points.ts', '@/lib/dates'],
    ['src/features/today/TodayPage.tsx', '@/services/activity'],
    ['src/features/today/TodayPage.tsx', '@/stores/profile'],
    ['src/services/activity.ts', '@/data/repos/activities'],
    ['src/data/converters/profile.ts', '@/domain/points'],
    ['src/app/AppShell.tsx', '@/features/today/TodayPage'],
    ['src/domain/points.ts', './level'],
  ])('%s may import %s', async (file, specifier) => {
    expect(await problems(file, importing(specifier))).toEqual([]);
  });
});

describe('markup rules', () => {
  const file = 'src/features/today/Widget.tsx';

  test('inline style with real properties is rejected', async () => {
    expect(await problems(file, `export const W = () => <div style={{ color: 'red' }} />;\n`)).toEqual([
      expect.stringMatching(/^no-restricted-syntax: Inline style dopuszcza tylko zmienne CSS/),
    ]);
    expect(await problems(file, `export const W = () => <div style="color: red" />;\n`)).toHaveLength(1);
    expect(await problems(file, `const s = { color: 'red' };\nexport const W = () => <div style={s} />;\n`)).toHaveLength(1);
  });

  test('inline CSS variables are allowed', async () => {
    expect(await problems(file, `export const W = (p: { v: string }) => <div style={{ '--progress': p.v }} />;\n`)).toEqual([]);
  });

  test('raw HTML injection is rejected', async () => {
    expect(await problems(file, `export const W = () => <div dangerouslySetInnerHTML={{ __html: '' }} />;\n`)).toHaveLength(1);
    expect(await problems(file, `export function f(el: HTMLElement) { el.innerHTML = ''; }\n`)).toHaveLength(1);
    expect(await problems(file, `export function f(el: HTMLElement) { el.insertAdjacentHTML('beforeend', ''); }\n`)).toHaveLength(1);
  });

  test('globals on window are rejected', async () => {
    expect(await problems(file, `export function f() { (window as any).x = 1; window.name = 'x'; }\n`)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Bez globali na window/)]),
    );
  });
});
