import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseRemoteHost } from './git.js'

describe('parseRemoteHost', () => {
  it('HTTPS URL with .git suffix', () => {
    assert.equal(parseRemoteHost('https://github.com/owner/repo.git'), 'github.com')
  })

  it('HTTPS URL without .git suffix', () => {
    assert.equal(parseRemoteHost('https://github.com/owner/repo'), 'github.com')
  })

  it('GitHub Enterprise HTTPS', () => {
    assert.equal(parseRemoteHost('https://github.example.com/owner/repo.git'), 'github.example.com')
  })

  it('SCP-like SSH', () => {
    assert.equal(parseRemoteHost('git@github.com:owner/repo.git'), 'github.com')
  })

  it('GitHub Enterprise SCP-like SSH', () => {
    assert.equal(parseRemoteHost('git@github.example.com:owner/repo.git'), 'github.example.com')
  })

  it('SSH URL scheme', () => {
    assert.equal(parseRemoteHost('ssh://git@github.com/owner/repo.git'), 'github.com')
  })

  it('SSH URL with non-standard port', () => {
    assert.equal(parseRemoteHost('ssh://git@github.com:2222/owner/repo.git'), 'github.com')
  })

  it('normalizes host to lowercase', () => {
    assert.equal(parseRemoteHost('https://GitHub.COM/owner/repo'), 'github.com')
  })

  it('trims surrounding whitespace', () => {
    assert.equal(parseRemoteHost('  https://github.com/owner/repo.git  '), 'github.com')
  })

  it('empty string returns undefined', () => {
    assert.equal(parseRemoteHost(''), undefined)
  })

  it('non-URL string without path returns undefined', () => {
    assert.equal(parseRemoteHost('not-a-url'), undefined)
  })
})
