# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

- **Runtime**: Node.js (pinned via Volta in `package.json` → `volta.node`)
- **Package manager**: Yarn 1.x classic (pinned via `volta.yarn`)
- **ORM**: Sequelize 6 with the `pg` + `pg-hstore` driver (PostgreSQL)
- **Tests**: Jest

## Commands

```bash
yarn install            # install deps
yarn test               # run full jest suite
yarn jest path/to/file  # run a single test file
yarn jest -t "name"     # run tests matching a name pattern
```

## Adding dependencies — registry gotcha

The global `~/.npmrc` points to Qonto's internal proxy (`package-registry.tooling-production.qonto.co`), which does **not** mirror public packages like `sequelize`, `pg`, `jest`, etc. A plain `yarn add <pkg>` will fail with `Couldn't find package ... on the "npm" registry`.

Always install against the public registry explicitly:

```bash
yarn add <pkg> --registry https://registry.npmjs.org
yarn add --dev <pkg> --registry https://registry.npmjs.org
```

Do not modify the global `~/.npmrc` to work around this — the proxy is required for other (Qonto) projects.
