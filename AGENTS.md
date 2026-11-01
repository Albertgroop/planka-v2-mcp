# Repository Guidelines

## Project Structure & Module Organization

This repository implements a TypeScript ESM MCP server for Planka v2.x. `index.ts` is the executable entry point: it picks the transport (stdio, or HTTP via `common/http.ts`). `server.ts` builds the MCP server and registers the tools; in HTTP mode it is called once per request. In HTTP mode the caller's Planka API key travels in a per-request `AsyncLocalStorage` context (`common/context.ts`): never cache anything user-specific at module level, and never fall back to `PLANKA_*` credentials when a context exists. Resource-level HTTP operations live in `operations/` (for example, `cards.ts` and `taskLists.ts`), while higher-level composed behaviors live in `tools/`. Keep shared types, request setup, error handling, and utilities in `common/`. Jest tests and reusable fixtures belong in `tests/`; generated JavaScript is written to `dist/` and must not be edited directly. OpenSpec change artifacts live under `openspec/`.

## Build, Test, and Development Commands

- `npm ci`: install the lockfile-pinned dependencies; Node.js 18 or newer is required.
- `npm run build`: compile TypeScript into `dist/` and make the entry point executable.
- `npm run watch`: recompile continuously during development.
- `npm test`: run unit tests, excluding the live integration suite.
- `npm run test:integration`: exercise a configured Planka v2 instance.
- `npm run inspector`: launch the MCP Inspector against the built server.
- `npm run qc`: run type checking, linting, build, and unit tests; use this before submitting changes.
- `npm run planka:up`: start the bundled Planka and PostgreSQL development stack.
- `npm run planka:down`: stop the development stack while preserving its data.
- `npm run planka:clear`: stop the development stack and delete its volumes.
- `npm run clear`: delete the `dist/` and `node_modules/` directories.

## Coding Style & Naming Conventions

TypeScript is strict and uses NodeNext module resolution. Include `.js` extensions in relative imports, even in `.ts` files. Biome enforces two-space indentation, double quotes, semicolons, trailing commas, LF endings, and a 100-character line width. Run `npm run lint:fix` and `npm run format:fix` for automated cleanup. Use `camelCase` for functions and variables, `PascalCase` for types, and descriptive resource-based filenames consistent with existing modules.

## Testing Guidelines

Tests use Jest with `ts-jest` in ESM mode. Name files `tests/*.test.ts`, reuse `tests/fixtures.ts`, and isolate API behavior with `jest.unstable_mockModule` where practical. Add regression tests for behavior changes. Run `npm run test:coverage` when assessing coverage; no fixed percentage threshold is configured. Integration tests require a live Planka instance and valid local `PLANKA_*` settings.

## Commit & Pull Request Guidelines

Write short, imperative commit subjects. Prefer the established Conventional Commit prefixes, such as `feat:`, `fix:`, `docs:`, `ci:`, `refactor:`, and `chore:`. Keep pull requests focused; include a concise description, a linked issue when applicable, tests added or updated, and the `npm run qc` result. Report integration-test results for changes to Planka API calls, and include screenshots only for documentation or Inspector-visible changes where they clarify behavior.

## Security & Configuration

Copy `.env.example` for local configuration, but never commit credentials. Use a dedicated Planka agent account. Enable `PLANKA_IGNORE_SSL` only for trusted local or self-signed environments.

## Releases

In the pull request, bump the version in `package.json` and `common/version.ts` (a test keeps them equal) and add its `## [X.Y.Z] – YYYY-MM-DD` section to `CHANGELOG.md` (`tests/changelog.test.ts` fails without it). On merge, `.github/workflows/release.yml` publishes the Docker image `hub2rock/planka-v2-mcp` (`X.Y.Z`, `X.Y`, `X`) by calling `docker-publish.yml`, then creates the tag `vX.Y.Z` and the GitHub release with that section as description. Nobody pushes tags by hand; a merge that keeps the version releases nothing. The package is no longer published to npm (frozen at 1.1.0); do not reintroduce an npm publish workflow.
