import type { Register } from 'claude-code'

const MIN_MS = 60_000
const TITLE = 'קלוד סיים'

const summarize = (answer: string): string => {
  const flat = answer.replace(/```[\s\S]*?```/g, ' ').replace(/[#*`>_]/g, '').replace(/\s+/g, ' ').trim()
  if (!flat) return 'הבקשה הושלמה.'
  const first = flat.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? flat
  return first.length > 140 ? first.slice(0, 137) + '…' : first
}

const esc = (s: string) => s.replace(/'/g, "''")

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || e.durationMs < MIN_MS) return result

    const body = summarize(e.answer)
    const attempts: string[][] = [
      ['osascript', '-e', `display notification ${JSON.stringify(body)} with title ${JSON.stringify(TITLE)}`],
      ['notify-send', TITLE, body],
      ['powershell', '-NoProfile', '-Command',
        `Add-Type -AssemblyName System.Windows.Forms; $n=New-Object System.Windows.Forms.NotifyIcon; ` +
        `$n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; ` +
        `$n.ShowBalloonTip(10000,'${esc(TITLE)}','${esc(body)}',[System.Windows.Forms.ToolTipIcon]::Info); Start-Sleep 11; $n.Dispose()`],
    ]
    for (const argv of attempts) {
      try {
        const r = await $.process.run(argv, { timeoutMs: 15_000 })
        if (r.exitCode === 0) break
      } catch {
        // tool not on this OS; try the next one
      }
    }
    return result
  }).catch(($, e, next) => next(e))
}
