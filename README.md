# quant-cli

Public open-source workspace for `tonquant`, the MIT-licensed CLI for agent-native multi-market research and TON compatibility workflows.

This repository is the public CLI boundary for:

- `apps/cli`
- `apps/quant-backend`
- `packages/core`

Hosted portal, signer, review, and settlement services are intentionally not part of this repository.

## License

This workspace is released under the MIT License. See [LICENSE](./LICENSE).

## Install

```bash
npm install -g tonquant
```

`tonquant` requires Bun on `PATH` because the published package ships Bun-targeted runtime bundles.

## Quick Start

```bash
tonquant context --json
tonquant research quote BTC
tonquant data list --json
```

## PI Factor Mining (Recommended)

TonQuant stays framework-neutral, but PI is the recommended IDE-side factor-mining workflow:

```bash
npm install -g tonquant
npm install -g @mariozechner/pi-coding-agent
pi install git:github.com/davebcn87/pi-autoresearch
pi install npm:@tonquant/pi-autoresearch
```

Durable CLI workflows remain available alongside the PI package:

- `tonquant autoresearch init`
- `tonquant autoresearch run --track <id>`
- `tonquant autoresearch promote --track <id> --candidate <id>`

## Collaboration Model

- Public issues and pull requests happen in this repository.
- The private/internal TonQuant monorepo remains the integration source of truth.
- Accepted public changes are backported into the source monorepo before the next export.
- Do not add dependencies on non-exported platform paths or hosted services from this repository.

See [docs/OSS_SYNC.md](./docs/OSS_SYNC.md) for the sync contract.

## Changelog

Release-facing changes are tracked in [CHANGELOG.md](./CHANGELOG.md).

## Development

```bash
bun install --frozen-lockfile
bun run check:boundary
bun run typecheck
bun run lint
HOME=$(mktemp -d /tmp/quant-cli-home-XXXXXX) bun run test
HOME=$(mktemp -d /tmp/quant-cli-home-XXXXXX) bun run --cwd apps/cli pack:smoke
```

## Release

- The public release lane lives in `.github/workflows/release-tonquant.yml`.
- npm publishing happens from `apps/cli`.
- `check:boundary`, `typecheck`, `lint`, `test`, and `pack:smoke` are mandatory before publish.

## Related Links

- Website: [tonquant.com](https://tonquant.com)
- npm: [`tonquant`](https://www.npmjs.com/package/tonquant)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- Internal/source monorepo: `Ancienttwo/ton-quant`
