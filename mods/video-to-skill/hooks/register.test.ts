import { expect, test } from 'claude-code/testing'

// The harness fills in origin and presentation, as the engine does for a typed command.
const typed = (args: string) => ({ command: 'video-to-skill', args }) as never

test('no arguments prints the usage and starts nothing', async ($, on) => {
  const spawned: string[][] = []
  on('process.spawn', async function* (_$, e) {
    spawned.push([...e.argv])
    return { value: { code: 0, signal: null } } as never
  })

  const { text } = await $.command.run(typed(''))

  expect(text).toContain('Usage: /video-to-skill')
  expect(spawned.length).toBe(0)
})

test('arguments reach the script as separate words, quotes kept together', async ($, on) => {
  const spawned: string[][] = []
  const submitted: string[] = []
  let finished: () => void = () => {}
  const done = new Promise<void>(resolve => (finished = resolve))

  on('process.spawn', async function* (_$, e) {
    spawned.push([...e.argv])
    yield { stream: 'stderr', text: '[video-to-skill] downloading "x"\n' } as const
    yield { stream: 'stdout', text: '{"name":"my-skill","skill_dir":"/work/.claude/skills/my-skill","frames":5,"segments":9}\n' } as const
    return { value: { code: 0, signal: null } } as never
  })
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('prompt.submit', (_$, e) => {
    submitted.push(e.text)
    finished()
    return { text: e.text }
  })

  await $.command.run(typed('https://example.com/v?a=1&b=2 --name "my skill" --frames=8 --global'))
  await done

  const argv = spawned[0]!
  expect(argv.slice(2)).toEqual(['https://example.com/v?a=1&b=2', '--name', 'my skill', '--frames=8', '--global'])
  expect(argv[1]).toContain('scripts/video_to_skill.py')
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('/work/.claude/skills/my-skill')
  expect(submitted[0]).toContain('SKILL.md')
  // prompt.submit treats a leading slash as a command
  expect(submitted[0]!.startsWith('/')).toBe(false)
})

test('a failing script reports its error and does not ask the model to finish', async ($, on) => {
  const submitted: string[] = []
  const logged: string[] = []
  let finished: () => void = () => {}
  const done = new Promise<void>(resolve => (finished = resolve))

  on('process.spawn', async function* () {
    yield { stream: 'stderr', text: '[video-to-skill] error: faster-whisper is missing. Install it with: pip install faster-whisper\n' } as const
    return { value: { code: 2, signal: null } } as never
  })
  on('prompt.submit', (_$, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.log', (_$, e) => {
    logged.push(e.text)
    finished()
    return { value: undefined } as never
  })

  await $.command.run(typed('https://example.com/v'))
  await done

  expect(logged.join('\n')).toContain('faster-whisper is missing')
  expect(submitted.length).toBe(0)
})
