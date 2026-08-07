# Contributing to Locomo Music OSS

Bug reports, focused fixes, tests, documentation, and clearly scoped feature
proposals are welcome.

Locomo Music OSS and the private official product have independent histories
and may diverge. Acceptance here does not promise that a contribution will
appear in the official product.

Before opening a change:

- search existing issues and pull requests;
- discuss substantial architecture, dependency, model, or asset changes first;
- keep pull requests focused and include appropriate tests;
- do not commit model weights, generated songs, private user data, credentials,
  signing material, official update configuration, or unlicensed assets; and
- report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

Run the model-free checks before submitting:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build:code
```

By submitting a contribution, you represent that you have the right to submit
it and agree that it may be distributed under this repository's MIT License.
No contributor license agreement is required.
