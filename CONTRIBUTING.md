# Contributing to Octopass

## Design

| File               | Responsibility                                                              |
| ------------------ | --------------------------------------------------------------------------- |
| `src/process.ts`   | Shared subprocess helper: wraps `execFile`, normalises exit codes.          |
| `src/gh.ts`        | GitHub CLI interface: `gh auth status`, `gh api` calls, token expiry parse. |
| `src/git.ts`       | Git interface: remote host detection, repository root resolution.           |
| `src/extension.ts` | Visual Studio Code lifecycle, status bar, commands, cache coordination.     |
| `esbuild.mjs`      | Bundle script that compiles TypeScript sources to `out/extension.js`.       |

`src/process.ts` is the only place that spawns processes; `src/gh.ts` and `src/git.ts` never call `execFile` directly.
`GH_PROMPT_DISABLED=1` is set in the subprocess environment so that `gh` never blocks waiting for user input during an
automated check.

## Development Setup

- Node.js 24
- npm

```bash
npm ci
npm run build
```

Use the **Run Extension** launch configuration (`F5`) to open an Extension Development Host with Octopass
loaded and all other extensions disabled.

## Local Verification

Lint:

```bash
docker pull ghcr.io/goeselt/pedant:latest
docker run --rm -v "$(pwd):/work" ghcr.io/goeselt/pedant:latest
```

Update dependencies:

```bash
npm run update
```

Tests:

```bash
npm test
```

Typecheck and build:

```bash
npm run verify
```

## Submitting Changes

Commit messages and PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/). The release
pipeline uses the PR title to determine the next version.
