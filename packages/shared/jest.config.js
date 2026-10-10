/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\.ts$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
  coverageThreshold: { global: { lines: 80 } },
};
