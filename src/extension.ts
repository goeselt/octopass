import * as vscode from 'vscode'
import { checkAuthStatus, checkGhAvailable, type AuthStatus } from './gh.js'
import { clearGitCache, repoHostForPath } from './git.js'

const STATUS_TTL_FLOOR_MS = 60_000

type CacheEntry = { status: AuthStatus; expires: number }

const statusCache = new Map<string, CacheEntry>()
const statusInFlight = new Map<string, Promise<AuthStatus>>()

let statusBar: vscode.StatusBarItem
let output: vscode.OutputChannel
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let currentHost: string | undefined
let currentHosts: string[] = []
let ghAvailable: boolean | undefined

export function activate(ctx: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel('Octopass')
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80)
  statusBar.command = 'octopass.showStatus'

  ctx.subscriptions.push(
    output,
    statusBar,
    vscode.commands.registerCommand('octopass.refresh', () => refresh(true)),
    vscode.commands.registerCommand('octopass.login', loginCurrentHost),
    vscode.commands.registerCommand('octopass.showStatus', showStatus),
    vscode.window.onDidChangeActiveTextEditor(() => scheduleRefresh(false)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      clearGitCache()
      scheduleRefresh(true)
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('octopass')) return
      statusCache.clear()
      scheduleRefresh(true)
    }),
  )

  scheduleRefresh(false)
}

export function deactivate() {
  if (debounceTimer) clearTimeout(debounceTimer)
  statusCache.clear()
  statusInFlight.clear()
}

function scheduleRefresh(force: boolean) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void refresh(force)
  }, 250)
}

async function refresh(force: boolean) {
  const config = vscode.workspace.getConfiguration('octopass')
  if (force) clearGitCache()

  // The status is computed even when the status bar is hidden so the
  // Show Status command and the cache stay current; do not return early here.
  if (!config.get<boolean>('showStatusBar', true)) {
    statusBar.hide()
  }

  const cwd = workspaceCwd()
  ghAvailable = await checkGhAvailable(cwd)
  if (!ghAvailable) {
    currentHost = undefined
    currentHosts = []
    showMissingGh()
    return
  }

  const repoHost = await activeRepoHost()
  currentHost = repoHost
  const hosts = orderedHosts(repoHost, config.get<string[]>('hosts', []))

  if (hosts.length === 0) {
    currentHosts = []
    showNoRepo()
    return
  }

  currentHosts = hosts

  const includeTokenMetadata = config.get<boolean>('checkTokenExpiration', true)
  const statuses = await Promise.all(hosts.map((host) => getAuthStatus(host, cwd, force, includeTokenMetadata)))
  writeOutput(statuses, includeTokenMetadata)
  updateStatusBar(repoHost, statuses)
}

async function showStatus() {
  await refresh(false)

  if (ghAvailable === false) {
    const choice = await vscode.window.showWarningMessage(
      'Octopass: GitHub CLI (gh) is not installed or not on PATH.',
      'Install gh',
    )
    if (choice === 'Install gh') void vscode.env.openExternal(vscode.Uri.parse('https://cli.github.com/'))
    return
  }

  const statuses = currentHosts
    .map((host) => statusCache.get(host)?.status)
    .filter((status): status is AuthStatus => status !== undefined)
    .sort((a, b) => a.host.localeCompare(b.host))
  if (statuses.length === 0) {
    vscode.window.showInformationMessage('Octopass: no Git repository host found for the active file or folder.')
    return
  }

  const items = statuses.map((status) => ({
    label: status.state === 'ok' ? `$(pass) ${status.host}` : `$(warning) ${status.host}`,
    description: status.account ? status.account : status.detail,
    detail: statusLine(status),
    status,
  }))

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Octopass: Authentication Status',
    placeHolder: 'Select a host',
  })
  if (!picked) return

  const action = await vscode.window.showQuickPick(
    [
      { label: 'Show Output', action: 'output' as const },
      { label: `Log In to ${picked.status.host}`, action: 'login' as const },
      { label: `Refresh ${picked.status.host}`, action: 'refresh' as const },
    ],
    { title: picked.status.host },
  )
  if (!action) return

  if (action.action === 'output') output.show()
  if (action.action === 'login') await loginHost(picked.status.host)
  if (action.action === 'refresh') {
    await getAuthStatus(
      picked.status.host,
      workspaceCwd(),
      true,
      vscode.workspace.getConfiguration('octopass').get<boolean>('checkTokenExpiration', true),
    )
    await refresh(false)
  }
}

async function loginCurrentHost() {
  await refresh(false)
  if (!ghAvailable) {
    void vscode.window
      .showWarningMessage('Octopass: GitHub CLI (gh) is not installed or not on PATH.', 'Install gh')
      .then((choice) => {
        if (choice === 'Install gh') void vscode.env.openExternal(vscode.Uri.parse('https://cli.github.com/'))
      })
    return
  }

  if (!currentHost) {
    vscode.window.showInformationMessage('Octopass: no Git repository host found for the active file or folder.')
    return
  }

  await loginHost(currentHost)
}

async function loginHost(host: string) {
  const command = `gh auth login --hostname ${shellQuote(host)}`
  const choice = await vscode.window.showInformationMessage(
    `Octopass will open a terminal and run: ${command}`,
    'Open Terminal',
  )
  if (choice !== 'Open Terminal') return

  const terminal = vscode.window.createTerminal({ name: `Octopass: ${host}` })
  terminal.show()
  terminal.sendText(command)
}

async function activeRepoHost(): Promise<string | undefined> {
  const activePath =
    vscode.window.activeTextEditor?.document.uri.scheme === 'file'
      ? vscode.window.activeTextEditor.document.uri.fsPath
      : undefined

  if (activePath) return await repoHostForPath(activePath)

  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder || folder.uri.scheme !== 'file') return undefined
  return await repoHostForPath(folder.uri.fsPath)
}

function orderedHosts(repoHost: string | undefined, configuredHosts: string[]): string[] {
  const hosts = new Set<string>()
  if (repoHost) hosts.add(repoHost)
  for (const host of configuredHosts) {
    const normalized = host.trim().toLowerCase()
    if (normalized) hosts.add(normalized)
  }
  return [...hosts]
}

function getAuthStatus(host: string, cwd: string, force: boolean, includeTokenMetadata: boolean): Promise<AuthStatus> {
  const cached = statusCache.get(host)
  if (!force && cached && cached.expires > Date.now()) return Promise.resolve(cached.status)

  const inFlight = statusInFlight.get(host)
  if (inFlight) return inFlight

  const promise = checkAuthStatus(host, cwd, includeTokenMetadata)
    .then((status) => {
      statusCache.set(host, {
        status,
        expires: Date.now() + ttlMs(),
      })
      return status
    })
    .finally(() => {
      if (statusInFlight.get(host) === promise) statusInFlight.delete(host)
    })

  statusInFlight.set(host, promise)
  return promise
}

function updateStatusBar(repoHost: string | undefined, statuses: AuthStatus[]) {
  if (!vscode.workspace.getConfiguration('octopass').get<boolean>('showStatusBar', true)) return

  const current = repoHost ? statuses.find((status) => status.host === repoHost) : undefined
  if (!current) {
    showNoRepo()
    return
  }

  statusBar.text =
    current.state === 'ok' ? `$(github) ${current.host}: signed in` : `$(warning) ${current.host}: sign in`
  statusBar.tooltip = statusLine(current)
  statusBar.show()
}

function showMissingGh() {
  if (!vscode.workspace.getConfiguration('octopass').get<boolean>('showStatusBar', true)) return
  statusBar.text = '$(warning) gh not found'
  statusBar.tooltip = 'GitHub CLI (gh) not found on PATH. Click for install guidance.'
  statusBar.show()
}

function showNoRepo() {
  if (!vscode.workspace.getConfiguration('octopass').get<boolean>('showStatusBar', true)) return
  statusBar.text = '$(github) no repo'
  statusBar.tooltip = 'No Git repository with a remote host found for the active file or folder.'
  statusBar.show()
}

function writeOutput(statuses: AuthStatus[], includeTokenMetadata: boolean) {
  const n = statuses.length
  output.clear()
  output.appendLine(`Checked ${n} ${n === 1 ? 'host' : 'hosts'} at ${new Date().toLocaleString()}.`)
  output.appendLine('Auth command: gh auth status --hostname <host>')
  output.appendLine(
    includeTokenMetadata
      ? 'Token metadata command: gh api --hostname <host> --include --silent /user'
      : 'Token metadata command: not run (octopass.checkTokenExpiration is disabled).',
  )
  output.appendLine('SSH access: not checked.')
  output.appendLine('')

  for (const status of statuses) {
    output.appendLine(`${status.host}: ${statusLine(status)}`)
    if (status.raw) {
      output.appendLine(status.raw)
    }
    output.appendLine('')
  }
}

function statusLine(status: AuthStatus): string {
  const parts = [status.detail]
  if (status.gitProtocol) parts.push(`Git protocol: ${status.gitProtocol}`)
  if (status.gitProtocol?.toLowerCase() === 'ssh') parts.push('SSH access: not checked')
  if (status.tokenKind) parts.push(`Token: ${status.tokenKind}`)
  parts.push(tokenExpiryLine(status))
  if (status.scopes?.length) parts.push(`Scopes: ${status.scopes.join(', ')}`)
  parts.push(`Checked: ${status.checkedAt.toLocaleTimeString()}`)
  return parts.join(' | ')
}

function tokenExpiryLine(status: AuthStatus): string {
  if (status.tokenExpiresAt) return `Token expires: ${formatDateTime(status.tokenExpiresAt)}`
  if (status.tokenExpirationCheckedAt) return 'Token expires: not reported'
  return 'Token expires: not checked'
}

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function workspaceCwd(): string {
  const folder = vscode.workspace.workspaceFolders?.[0]
  return folder?.uri.scheme === 'file' ? folder.uri.fsPath : process.cwd()
}

function ttlMs(): number {
  const minutes = vscode.workspace.getConfiguration('octopass').get<number>('checkIntervalMinutes', 15)
  return Math.max(STATUS_TTL_FLOOR_MS, minutes * 60_000)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}
