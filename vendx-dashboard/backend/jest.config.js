module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/setup-env.js"],
  moduleNameMapper: {
    "^firebase-admin$": "<rootDir>/tests/mocks/firebase-admin.js"
  },
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  verbose: true
};
