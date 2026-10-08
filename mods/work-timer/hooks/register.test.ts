import { test, expect } from 'claude-code/testing'
import { fmt, median, estimate } from './register'

test('fmt', () => { expect(fmt(83_000)).toBe('1:23'); expect(fmt(3_725_000)).toBe('1:02:05') })
test('median', () => { expect(median([])).toBe(undefined); expect(median([5, 1, 3])).toBe(3); expect(median([1, 2, 3, 4])).toBe(2.5) })
test('estimate by tasks: average per task times remaining', () => {
  const left = estimate(60_000, { total: 5, done: 2, firstAt: 0, lastDoneAt: 40_000 }, [999_999])
  expect(left).toBe(60_000)
})
test('estimate by median of history when no tasks', () => {
  expect(estimate(10_000, { total: 0, done: 0, firstAt: undefined, lastDoneAt: undefined }, [30_000, 50_000, 40_000])).toBe(30_000)
  expect(estimate(10_000, { total: 0, done: 0, firstAt: undefined, lastDoneAt: undefined }, [])).toBe(undefined)
})
