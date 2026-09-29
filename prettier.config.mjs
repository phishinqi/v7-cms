/** @type {import('prettier').Config} */
export default {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'always',
  overrides: [{ files: ['*.yml', '*.yaml'], options: { parser: 'yaml' } }],
};
