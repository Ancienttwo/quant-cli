## Summary

- describe the public CLI change

## Verification

- [ ] `bun run check:boundary`
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `HOME=$(mktemp -d /tmp/quant-cli-home-XXXXXX) bun run test`
- [ ] `HOME=$(mktemp -d /tmp/quant-cli-home-XXXXXX) bun run --cwd apps/cli pack:smoke`

## Boundary Check

- [ ] no references to internal web app paths
- [ ] no references to internal platform API paths
- [ ] no new dependency on hosted-only platform behavior
