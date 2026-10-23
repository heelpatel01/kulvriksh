// ESLint configuration for the API and the shared package.
// The web app has its own config (apps/web/eslint.config.mjs) based on eslint-config-next.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/dist/**', '**/.next/**', 'apps/web/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
]);
