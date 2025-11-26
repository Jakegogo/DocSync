/** @type {import('jest').Config} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	testMatch: ["**/tests/**/*.test.ts"],
	moduleNameMapper: {
		"^obsidian$": "<rootDir>/tests/obsidian-mock.ts",
		"^\\.\\./reverse-sync$": "<rootDir>/reverse-sync.ts",
	},
};


