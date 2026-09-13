# Contributing to Hermes Mission Control

Thanks for your interest in improving Mission Control.

## Scope

Mission Control is a **standalone satellite application** in its own repository (this repo). It must not modify Hermes core files (`hermes_cli/`, `gateway/`, `pyproject.toml`, etc.). All backend needs are served by the telemetry sidecar on port `8765`.

## Before you start

- Open an issue or discussion for large changes.
- Keep the core isolated: new data sources go into `server/local_telemetry_server.py`, not `hermes_cli/web_server.py`.
- Match the existing TypeScript/React patterns and Tailwind conventions.
- Node.js >= 22.6 (the TS test suites need native type stripping).
- Run `pnpm build` and `pnpm test` before submitting. Note that `pnpm test` covers the **Python** suites only — also run the JS/TS script for the area you touched (e.g. `pnpm test:rooms`).
- New tests must **call** the logic under test. Do not assert on source text with `readFileSync` + `includes`: those tests pass when the wiring is subtly wrong, fail on a correct refactor, and cannot run against a bundled artifact.

## Development

```bash
pnpm install
pnpm dev:full
```

The telemetry server is a Python sidecar in `server/`. It does not hot-reload; restart it after backend changes.

## Pull requests

1. Keep commits focused and the diff minimal.
2. Do not include `.env`, tokens, or local paths.
3. Verify the dashboard still loads on both desktop and mobile widths.
