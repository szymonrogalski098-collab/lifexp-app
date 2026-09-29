// Architecture rules from docs/v2/PLAN.md 4.2 and 7.7, enforced instead of
// "by convention". tests/lint-architecture.test.ts checks that each rule fires.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Layers a layer must NOT import (PLAN.md 4.2). Everything else is allowed.
const FORBIDDEN_IMPORTS = {
  lib: ['app', 'features', 'services', 'stores', 'offline', 'data', 'domain', 'ui', 'i18n'],
  domain: ['app', 'features', 'services', 'stores', 'offline', 'data', 'ui', 'i18n'],
  i18n: ['app', 'features', 'services', 'stores', 'offline', 'data', 'domain', 'ui'],
  ui: ['app', 'features', 'services', 'stores', 'offline', 'data', 'domain'],
  data: ['app', 'features', 'services', 'stores', 'offline', 'ui'],
  stores: ['app', 'features', 'ui'],
  services: ['app', 'features', 'ui'],
  offline: ['app', 'features', 'ui'],
  features: ['app', 'data'],
};

const layerRules = Object.entries(FORBIDDEN_IMPORTS).map(([layer, forbidden]) => ({
  files: [`src/${layer}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        // "@/data/x", "../data/x", "../../data/x"
        regex: `^(?:@/|(?:\\.\\./)+)(?:${forbidden.join('|')})(?:/|$)`,
        message: `Warstwa "${layer}" nie może importować: ${forbidden.join(', ')} (PLAN.md 4.2).`,
      }],
    }],
  },
}));

const HTML_INJECTION = 'HTML wstawia wyłącznie komponent Markdown (sanityzowany).';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-syntax': ['error',
        { selector: "JSXAttribute[name.name='style'] > Literal", message: 'Style w CSS, nie inline (PLAN.md 7.7).' },
        {
          selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > :not(ObjectExpression)",
          message: 'Inline style tylko jako literał obiektu ze zmiennymi CSS (PLAN.md 7.7).',
        },
        {
          selector: "JSXAttribute[name.name='style'] Property:not([key.value=/^--/])",
          message: 'Inline style dopuszcza tylko zmienne CSS, np. { "--progress": x } (PLAN.md 7.7).',
        },
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: HTML_INJECTION },
        { selector: 'AssignmentExpression > MemberExpression.left[property.name=/^(inner|outer)HTML$/]', message: HTML_INJECTION },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: HTML_INJECTION },
        {
          selector: "AssignmentExpression > MemberExpression.left[object.name='window']",
          message: 'Bez globali na window — importuj moduł.',
        },
      ],
    },
  },
  ...layerRules,
  {
    files: ['*.{js,ts}', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
