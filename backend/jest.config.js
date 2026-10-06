module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    'src/**/*.ts',
    '!src/server.js',
    '!src/config/**',
    '!**/node_modules/**',
    '!**/tests/**'
  ],
  // TypeScript é o padrão da casa; o `.js` continua aceito enquanto a migração
  // da Fase 1 do roadmap não termina. Teste novo nasce `.ts`.
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts'
  ],
  // `ts-jest` compila o TypeScript na hora, direto de `src` — o teste nunca lê
  // `dist`, que é artefato de build e estaria velho na metade das rodadas.
  //
  // O `.js` entrou aqui em 26/08/2026 por um motivo que não é estético:
  // declarar `transform` SUBSTITUI o `babel-jest` padrao, e sem transform
  // algum o Jest não IÇA as chamadas de `jest.mock`. Em 27 arquivos `.test.js`
  // o `jest.mock(...)` aparecia depois dos `require`, então o módulo real já
  // estava no cache quando o mock era registrado: o teste configurava um espião
  // que o código nunca chamava, e passava assim mesmo. `tests/routes/billing`
  // era o único que gritava — falhava com 400 porque o gateway real ia ao banco.
  //
  // `ts-jest` tem o mesmo transformador de içamento e o tsconfig já tem
  // `allowJs`, então cobrir `.js` corrige os 27 de uma vez, sem dependência nova.
  transform: {
    '^.+\.(ts|tsx|js)$': ['ts-jest', { isolatedModules: true, diagnostics: false }]
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/'
  ],
  // Coverage threshold desabilitado temporariamente
  // Será aumentado gradualmente conforme mais testes forem adicionados
  // coverageThreshold: {
  //   global: {
  //     branches: 30,
  //     functions: 30,
  //     lines: 30,
  //     statements: 30
  //   }
  // },
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json'
  ],
  verbose: true,
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  }
};
