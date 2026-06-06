import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseAuthStatus } from './gh.js'

const LOGGED_IN_HTTPS = `github.com
  - Logged in to github.com account octocat (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'`

const LOGGED_IN_SSH = `github.com
  - Logged in to github.com account octocat (keyring)
  - Active account: true
  - Git operations protocol: ssh
  - Token: ghp_************************************`

const LOGGED_IN_FINE_GRAINED = `github.com
  - Logged in to github.com account octocat (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: github_pat_****`

const NOT_LOGGED_IN = `github.com
  X You are not logged into any GitHub hosts. Run \`gh auth login\` to authenticate.`

const NO_TOKEN_SET = `github.com
  X No authentication token set for github.com host.
  - To authenticate, run \`gh auth login --hostname github.com\``

const TOKEN_EXPIRED = `github.com
  X Token expired.`

describe('parseAuthStatus', () => {
  it('logged in via HTTPS with OAuth token', () => {
    const s = parseAuthStatus('github.com', LOGGED_IN_HTTPS)
    assert.equal(s.state, 'ok')
    assert.equal(s.host, 'github.com')
    assert.equal(s.account, 'octocat')
    assert.equal(s.activeAccount, true)
    assert.equal(s.gitProtocol, 'https')
    assert.equal(s.tokenPrefix, 'gho_')
    assert.equal(s.tokenKind, 'OAuth token')
    assert.deepEqual(s.scopes, ['gist', 'read:org', 'repo', 'workflow'])
  })

  it('logged in via SSH with classic PAT', () => {
    const s = parseAuthStatus('github.com', LOGGED_IN_SSH)
    assert.equal(s.state, 'ok')
    assert.equal(s.gitProtocol, 'ssh')
    assert.equal(s.tokenPrefix, 'ghp_')
    assert.equal(s.tokenKind, 'classic personal access token')
    assert.equal(s.scopes, undefined)
  })

  it('logged in with fine-grained PAT', () => {
    const s = parseAuthStatus('github.com', LOGGED_IN_FINE_GRAINED)
    assert.equal(s.state, 'ok')
    assert.equal(s.tokenPrefix, 'github_pat_')
    assert.equal(s.tokenKind, 'fine-grained personal access token')
  })

  it('not logged in', () => {
    const s = parseAuthStatus('github.com', NOT_LOGGED_IN)
    assert.equal(s.state, 'not-authenticated')
    assert.equal(s.account, undefined)
  })

  it('no token set', () => {
    const s = parseAuthStatus('github.com', NO_TOKEN_SET)
    assert.equal(s.state, 'not-authenticated')
  })

  it('expired token', () => {
    const s = parseAuthStatus('github.com', TOKEN_EXPIRED)
    assert.equal(s.state, 'not-authenticated')
  })

  it('empty output', () => {
    const s = parseAuthStatus('github.com', '')
    assert.equal(s.state, 'error')
    assert.equal(s.account, undefined)
  })

  it('preserves the host argument', () => {
    const s = parseAuthStatus('github.example.com', LOGGED_IN_HTTPS)
    assert.equal(s.host, 'github.example.com')
  })
})
