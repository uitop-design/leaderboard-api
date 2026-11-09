export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**', '!src/main.ts'],
  coverageDirectory: 'coverage',
};
