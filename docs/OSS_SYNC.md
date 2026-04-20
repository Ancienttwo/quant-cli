# OSS Sync Contract

## Repository Roles

- `Ancienttwo/ton-quant`: internal/source monorepo and integration boundary
- `Ancienttwo/quant-cli`: public open-source CLI workspace

The public repo is not the only source of truth. It is a clean export of the CLI workspace from the source monorepo.

## Exported Boundary

The public repo contains only:

- `apps/cli`
- `apps/quant-backend`
- `packages/core`
- root workspace metadata, CI, docs, and release files needed to build and ship the CLI

It does not include hosted platform services or internal-only surfaces.

## Change Flow

1. Public issue or PR lands in `Ancienttwo/quant-cli`.
2. The accepted change is backported into `Ancienttwo/ton-quant`.
3. The next export regenerates `Ancienttwo/quant-cli` from the source monorepo.

This keeps one integration truth while still allowing public collaboration.

## Source-Repo Export Commands

From the source monorepo:

```bash
bun run export:quant-cli -- --output-dir /tmp/quant-cli
bun run scripts/check-quant-cli-boundary.ts --repo-root /tmp/quant-cli
```

Optional force-push to the public repo:

```bash
bun run export:quant-cli -- \
  --output-dir /tmp/quant-cli \
  --remote https://github.com/Ancienttwo/quant-cli.git \
  --branch main \
  --push
```

## Required Push Credentials

- write access to `Ancienttwo/quant-cli`
- a token or deploy key that can push to the target repo
- `NPM_TOKEN` only if publishing to npm from the public repo
