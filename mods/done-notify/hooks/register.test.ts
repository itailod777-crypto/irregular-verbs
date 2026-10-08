import { test, expect } from 'claude-code/testing'

const turn = (durationMs: number) =>
  ({ answer: '# סיימתי\nתיקנתי את הבאג. עוד פרטים.', durationMs, isAborted: false, turnId: 't', reason: 'answer' }) as const

test('long turn notifies with the title and first sentence', async ($, on) => {
  const calls: string[][] = []
  on('process.run', async (_$, e) => { calls.push([...e.argv]); return { value: { exitCode: 0, stdout: '', stderr: '' } } as never })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  await $.turn.complete(turn(90_000) as never)
  expect(calls.length).toBe(1)
  expect(calls[0]!.join(' ')).toContain('קלוד סיים')
})

test('short turn stays silent', async ($, on) => {
  const calls: string[][] = []
  on('process.run', async (_$, e) => { calls.push([...e.argv]); return { value: { exitCode: 0, stdout: '', stderr: '' } } as never })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  await $.turn.complete(turn(5_000) as never)
  expect(calls.length).toBe(0)
})
