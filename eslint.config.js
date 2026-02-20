import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        document: 'readonly',
        window: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
      }
    },
    rules: {
      // Dead code detection
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-unreachable': 'error',
      'no-constant-condition': 'error',

      // Complexity
      'complexity': ['warn', { max: 15 }],
      'max-depth': ['warn', { max: 4 }],
      'max-params': ['warn', { max: 5 }],

      // Code quality
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always'],
      'no-throw-literal': 'error',
      'no-implicit-globals': 'error',
      '@typescript-eslint/no-shadow': 'warn',

      // Style consistency
      'no-trailing-spaces': 'error',
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],

      // Allow explicit any where annotated
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow non-null assertions (we use them for known-present DOM elements)
      '@typescript-eslint/no-non-null-assertion': 'off',
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**']
  }
);
