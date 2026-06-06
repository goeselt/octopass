import { dirname } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { run } from './process.js'

const remoteHostCache = new Map<string, string | undefined>()

export async function repoHostForPath(filePath: string): Promise<string | undefined> {
  const cwd = cwdForPath(filePath)
  const cached = remoteHostCache.get(cwd)
  if (remoteHostCache.has(cwd)) return cached

  const inside = await run('git', ['rev-parse', '--is-inside-work-tree'], cwd, 5_000)
  if (inside.exitCode !== 0 || inside.stdout.trim() !== 'true') {
    remoteHostCache.set(cwd, undefined)
    return undefined
  }

  const remoteUrl = await findRemoteUrl(cwd)
  const host = remoteUrl ? parseRemoteHost(remoteUrl) : undefined
  remoteHostCache.set(cwd, host)
  return host
}

function cwdForPath(path: string): string {
  if (!existsSync(path)) return dirname(path)
  return statSync(path).isDirectory() ? path : dirname(path)
}

export function clearGitCache() {
  remoteHostCache.clear()
}

async function findRemoteUrl(cwd: string): Promise<string | undefined> {
  const origin = await run('git', ['remote', 'get-url', 'origin'], cwd, 5_000)
  if (origin.exitCode === 0 && origin.stdout.trim()) return origin.stdout.trim()

  const remotes = await run('git', ['remote'], cwd, 5_000)
  const firstRemote = remotes.stdout
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  if (!firstRemote) return undefined

  const firstUrl = await run('git', ['remote', 'get-url', firstRemote], cwd, 5_000)
  if (firstUrl.exitCode === 0 && firstUrl.stdout.trim()) return firstUrl.stdout.trim()
  return undefined
}

export function parseRemoteHost(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim()

  try {
    const url = new URL(trimmed)
    return normalizeHost(url.hostname)
  } catch {
    // SCP-like SSH syntax: git@github.com:owner/repo.git
    const scp = trimmed.match(/^[^@:/]+@([^:/]+):.+$/)
    if (scp) return normalizeHost(scp[1])

    const hostPath = trimmed.match(/^([^:/]+)[:/][^/].+$/)
    if (hostPath) return normalizeHost(hostPath[1])
  }

  return undefined
}

function normalizeHost(host: string): string | undefined {
  const normalized = host.trim().toLowerCase()
  return normalized || undefined
}
