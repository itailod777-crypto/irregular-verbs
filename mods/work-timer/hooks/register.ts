import type { Register, Timer, Hook } from 'claude-code'

type Dollar = Parameters<Hook<'turn.start'>>[0]

const HISTORY_KEY = 'durations'
const HISTORY_SIZE = 30

export const fmt = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

export const median = (xs: number[]): number | undefined => {
  if (xs.length === 0) return undefined
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1]! + s[mid]!) / 2
}

/** Remaining time: per-task average when a task list exists, else the median of past requests. */
export const estimate = (
  elapsed: number,
  tasks: { total: number; done: number; firstAt: number | undefined; lastDoneAt: number | undefined },
  history: number[],
): number | undefined => {
  if (tasks.total > 0 && tasks.done > 0 && tasks.firstAt !== undefined && tasks.lastDoneAt !== undefined) {
    const avg = (tasks.lastDoneAt - tasks.firstAt) / tasks.done
    return Math.max(0, tasks.total - tasks.done) * avg
  }
  const med = median(history)
  return med === undefined ? undefined : Math.max(0, med - elapsed)
}

let startedAt: number | undefined
let timer: Timer | undefined
let history: number[] = []
let total = 0
let firstAt: number | undefined
let lastDoneAt: number | undefined
const done = new Set<string>()
const deleted = new Set<string>()

async function draw($: Dollar): Promise<void> {
  if (startedAt === undefined) return
  const now = await $.clock.now()
  const elapsed = now - startedAt
  const left = estimate(elapsed, { total: total - deleted.size, done: done.size, firstAt, lastDoneAt }, history)
  const tail = left === undefined ? '' : left > 0 ? ` · נותר ~${fmt(left)}` : ' · עוד רגע'
  $.ui.status(`⏱ ${fmt(elapsed)}${tail}`)
}

export const register: Register = on => {
  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    timer?.cancel()
    startedAt = await $.clock.now()
    total = 0; firstAt = undefined; lastDoneAt = undefined; done.clear(); deleted.clear()
    const saved = await $.store.get(HISTORY_KEY)
    history = Array.isArray(saved) ? saved.filter((n): n is number => typeof n === 'number') : []
    await draw($)
    timer = $.clock.every(1000, () => { void draw($) })
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      total += 1
      firstAt ??= await $.clock.now()
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      if (e.status === 'completed') { done.add(e.taskId); lastDoneAt = await $.clock.now() }
      else if (e.status === 'deleted') deleted.add(e.taskId)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      const now = await $.clock.now()
      const finished = e.todos.filter(t => t.status === 'completed').length
      total = e.todos.length; deleted.clear(); firstAt ??= now
      if (finished > done.size) lastDoneAt = now
      done.clear()
      for (let i = 0; i < finished; i++) done.add(`todo-${i}`)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || startedAt === undefined) return result
    timer?.cancel()
    timer = undefined
    startedAt = undefined
    $.ui.status(`סיים ב-${fmt(e.durationMs)}`)
    if (e.reason === 'answer') {
      history = [...history, e.durationMs].slice(-HISTORY_SIZE)
      await $.store.set(HISTORY_KEY, history)
    }
    return result
  }).catch(($, e, next) => next(e))
}
