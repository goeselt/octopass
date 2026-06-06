import { execFile, type ExecFileException } from 'node:child_process'

export interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

export function run(command: string, args: string[], cwd: string, timeout = 8_000): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd,
        encoding: 'utf8',
        timeout,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, GH_PROMPT_DISABLED: '1' },
      },
      (error: ExecFileException | null, stdout: string, stderr: string) => {
        if (!error) {
          resolve({ exitCode: 0, stdout, stderr })
          return
        }

        const code = typeof error.code === 'number' ? error.code : 1
        resolve({ exitCode: code, stdout, stderr })
      },
    )
  })
}
