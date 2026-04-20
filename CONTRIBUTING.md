# Contributing to quant-cli

## Scope

This repository is the public open-source CLI surface for TonQuant.

In scope:

- `apps/cli`
- `apps/quant-backend`
- `packages/core`
- public docs, tests, and release automation for that workspace

Out of scope:

- hosted portal, signer, publish/review/settlement services
- internal-only workflows outside the exported workspace
- adding dependencies on non-exported source paths

## Local Setup

```bash
bun install --frozen-lockfile
bun run check:boundary
bun run typecheck
bun run lint
HOME=$(mktemp -d /tmp/quant-cli-home-XXXXXX) bun run test
HOME=$(mktemp -d /tmp/quant-cli-home-XXXXXX) bun run --cwd apps/cli pack:smoke
```

## Pull Request Expectations

- Keep changes inside the exported workspace boundary.
- Update tests and docs together when the public CLI contract changes.
- Do not reference internal-only web app or platform API paths from this repository.
- Keep npm/package metadata pointed at `Ancienttwo/quant-cli`.

## Sync Model

- This repository receives public issues and pull requests.
- Accepted changes are backported into the source monorepo first.
- The next export re-materializes this repo from the source monorepo to prevent drift.

See [docs/OSS_SYNC.md](./docs/OSS_SYNC.md) for the operational sync flow.
