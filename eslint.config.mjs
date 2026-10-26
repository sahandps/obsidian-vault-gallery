import obsidianmd from 'eslint-plugin-obsidianmd';
export default [
  { ignores: ['node_modules/**', '.preview/**', 'release/**', 'preview/**', 'tests/**', 'scripts/**', '*.mjs', 'main.js'] },
  ...obsidianmd.configs.recommended,
  { files: ['src/**/*.ts'], rules: { 'obsidianmd/ui/sentence-case': ['warn', { brands: ['Vault Gallery', 'Obsidian'] }] }, languageOptions: { parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname } } },
];
