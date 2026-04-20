# tonquant

Install with `npm install -g tonquant` and make sure `bun` is already on `PATH`.

Public repository: `https://github.com/Ancienttwo/quant-cli`

The published package ships both the CLI entrypoint and the bundled quant backend, so quant commands work after install without setting `TONQUANT_QUANT_CLI`.

Common commands:

```bash
tonquant --help
tonquant research quote --help
tonquant autoresearch --help
tonquant context --json
tonquant data list --json
```

Agent-facing entrypoint:

```bash
tonquant context --json
```

That snapshot is local-only by default. It summarizes the active config file, automation jobs, autoresearch tracks, signing sessions, publications, and recent quant artifacts without reaching out to remote services.

Explicit config path support:

```bash
tonquant --config /tmp/agent-wallet.json init --mnemonic "..."
tonquant --config /tmp/agent-wallet.json balance --json
tonquant --config /tmp/agent-wallet.json history --json
tonquant --config /tmp/agent-wallet.json context --json
```

Publication handoff:

```bash
tonquant factor publish-prepare my_factor --publisher-address <raw-ton-address> --output prepared.json
tonquant factor publish-request-signature --prepared-file prepared.json --json
```

The request-signature commands create signer sessions and return the next step explicitly. They do not claim the publication or payout change has already completed.

`swap --execute` is hidden from public help and returns a structured unsupported error if called directly during the compatibility window.
