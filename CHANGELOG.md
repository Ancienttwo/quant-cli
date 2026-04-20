# Changelog

All notable changes to the public `quant-cli` workspace are documented in this file.

The format is intentionally simple and public-repo focused. Internal monorepo-only changes do not belong here unless they affect the exported CLI workspace.

## [Unreleased]

## [0.2.0] - 2026-04-20

### Added

- Public `quant-cli` workspace export with:
  - `apps/cli`
  - `apps/quant-backend`
  - `packages/core`
  - public repo templates, issue/PR templates, and release workflow
- Boundary checker to keep internal-only repo paths out of the public workspace
- Source-repo sync workflow to validate and optionally force-push the exported workspace

### Changed

- Public package metadata and docs now point the CLI GitHub entrypoint at `Ancienttwo/quant-cli`
- Pack smoke verification now checks the current `research quote` command surface instead of the removed `price` command
