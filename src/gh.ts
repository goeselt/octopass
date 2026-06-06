import { run } from './process.js'

export type AuthState = 'ok' | 'missing-gh' | 'not-authenticated' | 'error'

export interface AuthStatus {
  host: string
  state: AuthState
  account?: string
  activeAccount?: boolean
  gitProtocol?: string
  tokenPrefix?: string
  tokenKind?: string
  tokenExpiresAt?: Date
  tokenExpirationCheckedAt?: Date
  scopes?: string[]
  checkedAt: Date
  detail: string
  raw: string
}

export async function checkGhAvailable(cwd: string): Promise<boolean> {
  const result = await run('gh', ['--version'], cwd, 5_000)
  return result.exitCode === 0
}

export async function checkAuthStatus(host: string, cwd: string, includeTokenMetadata: boolean): Promise<AuthStatus> {
  const result = await run('gh', ['auth', 'status', '--hostname', host], cwd, 8_000)
  const raw = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  const parsed = parseAuthStatus(host, raw)
  const state: AuthState =
    result.exitCode === 0
      ? parsed.state === 'ok'
        ? 'ok'
        : parsed.state
      : parsed.state === 'ok'
        ? 'error'
        : parsed.state
  const tokenMetadata = state === 'ok' && includeTokenMetadata ? await checkTokenMetadata(host, cwd) : undefined

  return {
    ...parsed,
    state,
    ...tokenMetadata,
    checkedAt: new Date(),
    raw,
  }
}

async function checkTokenMetadata(host: string, cwd: string): Promise<Partial<AuthStatus>> {
  const result = await run('gh', ['api', '--hostname', host, '--include', '--silent', '/user'], cwd, 8_000)
  if (result.exitCode !== 0) return {}

  const headers = parseHeaders(result.stdout)
  const expiresAt = parseDateHeader(headers.get('github-authentication-token-expiration'))

  return {
    tokenExpiresAt: expiresAt,
    tokenExpirationCheckedAt: new Date(),
  }
}

export function parseAuthStatus(host: string, raw: string): AuthStatus {
  const lines = raw.split(/\r?\n/).map((line) => line.trim())
  const text = lines.join('\n')
  const account = lines.map((line) => line.match(/Logged in to .* account ([^\s(]+)/)?.[1]).find(Boolean)
  const activeAccount = readBoolean(lines, 'Active account:')
  const gitProtocol = readValue(lines, 'Git operations protocol:')
  const tokenPrefix = readTokenPrefix(lines)
  const scopes = readScopes(lines)
  const state = /not logged in|no authentication|failed to authenticate|token.*invalid|token.*expired/i.test(text)
    ? 'not-authenticated'
    : account
      ? 'ok'
      : 'error'

  return {
    host,
    state,
    account,
    activeAccount,
    gitProtocol,
    tokenPrefix,
    tokenKind: tokenPrefix ? describeTokenPrefix(tokenPrefix) : undefined,
    scopes,
    checkedAt: new Date(0),
    detail: summarizeDetail(state, account, tokenPrefix),
    raw,
  }
}

function readBoolean(lines: string[], label: string): boolean | undefined {
  const value = readValue(lines, label)
  if (!value) return undefined
  if (/^true$/i.test(value)) return true
  if (/^false$/i.test(value)) return false
  return undefined
}

function readValue(lines: string[], label: string): string | undefined {
  const line = lines.find((entry) => entry.includes(label))
  if (!line) return undefined
  const value = line.slice(line.indexOf(label) + label.length).trim()
  return value || undefined
}

function readTokenPrefix(lines: string[]): string | undefined {
  const token = readValue(lines, 'Token:')
  if (!token) return undefined
  const match = token.match(/^(github_pat_|[A-Za-z0-9]+_)/)
  return match?.[1]
}

function readScopes(lines: string[]): string[] | undefined {
  const value = readValue(lines, 'Token scopes:')
  if (!value) return undefined
  const scopes = value
    .replace(/^'/, '')
    .replace(/'$/, '')
    .split(',')
    .map((scope) => scope.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
  return scopes.length > 0 ? scopes : undefined
}

function parseHeaders(raw: string): Map<string, string> {
  const headers = new Map<string, string>()
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    headers.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim())
  }
  return headers
}

function parseDateHeader(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function describeTokenPrefix(prefix: string): string {
  switch (prefix) {
    case 'github_pat_':
      return 'fine-grained personal access token'
    case 'ghp_':
      return 'classic personal access token'
    case 'gho_':
      return 'OAuth token'
    case 'ghu_':
      return 'GitHub App user token'
    case 'ghs_':
      return 'GitHub App server token'
    case 'ghr_':
      return 'refresh token'
    default:
      return `token with ${prefix} prefix`
  }
}

function summarizeDetail(state: AuthState, account: string | undefined, tokenPrefix: string | undefined): string {
  if (state === 'ok') return account ? `Logged in as ${account}` : 'Logged in'
  if (state === 'not-authenticated') return 'Not authenticated'
  if (tokenPrefix) return 'Unexpected response'
  return 'Status unknown'
}
