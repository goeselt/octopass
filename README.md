# Octopass

Visual Studio Code extension that checks whether the GitHub CLI is authenticated for the Git host you are currently
working in. It catches expired or missing logins before a push, pull, or API-backed workflow fails at the worst possible
moment.

## Quick Start

1. Install **Octopass** (`goeselt.octopass`) from the Visual Studio Code Extensions view.
2. Open a workspace that contains a Git repository with a GitHub remote.
3. The status bar item shows the authentication state for the detected host.

If the status shows unauthenticated or expired, run **Octopass: Login to Current Host** from the command palette -- it
opens a terminal with the exact `gh auth login` command pre-filled.

## Features

- Detects the Git remote host for the active file or workspace folder automatically.
- Shows a status bar item with the current host authentication state.
- Checks token expiration metadata from `gh api` response headers.
- Checks additional configured hosts beyond the detected remote.
- Offers a login path by opening a terminal with the exact `gh auth login --hostname <host>` command.
- Estimates token type from the masked token prefix (`gho_`, `ghp_`, `github_pat_`).
- Reports when `gh` is configured for SSH Git operations.
- Skips checks when the active location is not inside a Git repository.

## Commands

| Command                                   | Description                                      |
| ----------------------------------------- | ------------------------------------------------ |
| `Octopass: Refresh Authentication Status` | Re-check all configured and detected hosts.      |
| `Octopass: Show Authentication Status`    | Open the output panel with current auth state.   |
| `Octopass: Login to Current Host`         | Open a terminal with `gh auth login` pre-filled. |

## Configuration

| Setting                         | Default | Description                                                      |
| ------------------------------- | ------- | ---------------------------------------------------------------- |
| `octopass.hosts`                | `[]`    | Additional hosts to check, for example `["github.example.com"]`. |
| `octopass.checkIntervalMinutes` | `15`    | Minimum time before a host auth status is refreshed again.       |
| `octopass.checkTokenExpiration` | `true`  | Check cached token expiration metadata from GitHub API headers.  |
| `octopass.showStatusBar`        | `true`  | Show the Octopass status bar item.                               |

## SSH

When `gh auth status` reports `Git operations protocol: ssh`, Octopass shows that protocol in the status details.
Octopass intentionally does not run `ssh -T git@<host>` or similar automatic SSH access checks -- those can prompt for
key passphrases or hardware-key interaction. Avoiding them keeps Octopass quiet and predictable while still confirming
the API login state that `gh` commands rely on.

## Requirements

- Visual Studio Code `1.120.0` or newer.
- Git available on your `PATH`.
- GitHub CLI (`gh`) available on your `PATH`.

If `gh` is missing, Octopass shows an install recommendation and links to <https://cli.github.com/>.

## Privacy

Octopass runs local commands only:

```bash
git rev-parse --is-inside-work-tree
git remote get-url origin
gh auth status --hostname <host>
gh api --hostname <host> --include --silent /user
```

It does not request or display unmasked tokens. The `/user` request reads only response headers (token expiration,
rate-limit metadata) and is controlled by `octopass.checkTokenExpiration`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [LICENSE](LICENSE).
