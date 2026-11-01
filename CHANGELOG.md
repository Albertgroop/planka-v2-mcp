# Changelog

Each version has a `## [X.Y.Z] – YYYY-MM-DD` section. When a merge to `main`
changes the version in `package.json`, `.github/workflows/release.yml` publishes
the Docker image and creates the tag and the GitHub release with that section as
its description. A version bump without its section here fails the release.

## [1.3.0] – 2026-11-01

- HTTP mode: without a key, the **tool catalogue** can be read. A body made only of
  `initialize`, `notifications/initialized`, `tools/list` and `ping` is served;
  anything else (a tool call, a batch that mixes them) is still refused with 401.
  The gateway can then show the real tools to someone who has not registered their
  key yet, so nothing needs refreshing once they do.
- Such a request runs in a request context with no key: a Planka call there fails
  ("No Planka API key for this request") instead of falling back to
  `PLANKA_API_KEY` or the agent account.

## [1.2.0] – 2026-11-01

- **HTTP mode for several users** (`MCP_TRANSPORT=http` or `--http`): Streamable
  HTTP on `POST /mcp`, stateless, meant to run behind an authentication gateway that
  forwards each caller's own Planka API key (`X-Planka-Api-Key`, see
  `MCP_API_KEY_HEADER`). Planka attributes every change to that person. stdio is
  unchanged and remains the default (#4).
  - Each request uses only its caller's key; `PLANKA_API_KEY` and the agent
    email/password are never a fallback in this mode. Missing key → 401.
  - The acting user is the key's owner (`/api/users/me`), resolved once per request.
  - `GET /healthz`; `GET`/`DELETE /mcp` → 405.
- Docker image `hub2rock/planka-v2-mcp`: `X.Y.Z`, `X.Y`, `X`, `latest` (#4).
- npm is no longer published: the package stays at 1.1.0 for existing local
  installs (#5).

## [1.1.0]

- Per-user Planka API key authentication (`PLANKA_API_KEY`, sent as `X-Api-Key`),
  required when Planka runs with `OIDC_ENFORCED=true`.
- Published to npm as `@albertgroop/planka-v2-mcp`.
