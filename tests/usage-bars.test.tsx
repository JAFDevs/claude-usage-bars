import type { On, RenderSurface, SessionContextBreakdown, SessionMeasureInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SITE = { scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

const BAND = {
  plugin: 'usage-bars',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, ...SITE },
} as const

const PANE = {
  plugin: 'usage-bars',
  component: 'Pane',
  requestId: 'usage-bars',
  props: { title: 'Usage', isFocused: false, bodyColumns: 40, placement: 'dock', ...SITE },
} as const

const MEASURE: SessionMeasureInput = {
  context: { tokens: 84_000, window: 200_000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 72, resetsAt: '2026-11-07T16:30:00Z' },
    { kind: 'seven_day', percentUsed: 91.5, resetsAt: '2026-11-10T09:00:00Z' },
  ],
  cost: { usd: 1.25 },
  changed: ['context', 'rateLimits', 'cost'],
}

const run = (args: string) =>
  ({
    command: 'usage-bars',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  }) as const

// Nothing sits beneath the plugin: each hook here stands for the engine.
// `compactsAt` is the window /context measures against; absent, the engine
// gives no breakdown and the model's own window stands.
const engine = (on: On, surface: RenderSurface, compactsAt?: number) => {
  const pane = { isOpen: false }
  on('command.register', () => ({ value: { command: 'usage-bars' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: [surface] }))
  on('session.usage', (_, e) => ({
    value: {
      startedAt: 0,
      context: {
        window: 200_000,
        ...(e.breakdown !== undefined && compactsAt !== undefined
          ? { breakdown: { rawMaxTokens: compactsAt } as SessionContextBreakdown }
          : {}),
      },
      rateLimits: [],
    },
  }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.open', () => ((pane.isOpen = true), { value: { isPlaced: true } }))
  on('ui.close', () => ((pane.isOpen = false), { value: undefined }))
  on('ui.panes', () => ({
    value: pane.isOpen
      ? [{ id: 'usage-bars', title: 'Usage', isShown: true, isFocused: false, isPlaced: true }]
      : [],
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  return pane
}

test('on desktop the meters sit above the prompt as three animated lines', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const pane = engine(on, 'desktop')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE)

  expect(pane.isOpen).toBe(false)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const lines = await ui.findAll({ type: 'Svg' })
  expect(lines.length).toBe(3)
  expect(lines[0]?.props.height).toBe(4)
  expect(lines[0]?.props.width).toBeUndefined()
  // A thin line, no text inside: the label and percent sit above it.
  const weekly = String(lines[2]?.props.source)
  expect(weekly).not.toContain('<text')
  expect(weekly).toContain('repeatCount="indefinite"')
  expect(String(lines[2]?.props.alt)).toMatch(/^Weekly limit: 92% used, resets /)
  expect(await ui.find({ type: 'Text', text: 'Weekly limit' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '92%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '84k of 200k' })).toBeDefined()
  await ui.unmount()
})

test('/usage-bars side stacks the same lines in the pane', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const pane = engine(on, 'desktop')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE)
  await $.command.run(run('side'))

  expect(pane.isOpen).toBe(true)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const lines = await ui.findAll({ type: 'Svg' })
  expect(lines.length).toBe(3)
  expect(lines[0]?.props.height).toBe(4)
  expect(await ui.find({ type: 'Text', text: /\$1\.25/ })).toBeDefined()
  await ui.unmount()

  // The band stands aside while the pane is up.
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text' }))?.text).toBe('engine')
  await band.unmount()
})

test('a side pane an earlier version chose gives way to the band', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  // What the code before this edit stored: `mode` with no shape tag.
  on('state.get', (_, e, next) => (e.key === 'mode' ? { value: { value: 'side', version: 1 } } : next(e)))
  const pane = engine(on, 'desktop')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE)

  expect(pane.isOpen).toBe(false)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(3)
  await ui.unmount()
})

test('a new value grows in, then draws still once it settles', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  engine(on, 'desktop')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(run('band'))
  await $.session.measure(MEASURE)

  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  let bar = await ui.find({ type: 'Svg' })
  expect(String(bar?.props.source)).toContain('attributeName="width"')
  expect(bar?.props.isInteractive).toBe(true)
  await ui.unmount()

  await clock.advance(2000)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  bar = await ui.find({ type: 'Svg' })
  expect(String(bar?.props.source)).not.toContain('attributeName="width"')
  // The gradient keeps flowing once the value has settled.
  expect(String(bar?.props.source)).toContain('<linearGradient id="flow"')
  expect(String(bar?.props.source)).toContain('repeatCount="indefinite"')
  await ui.unmount()
})

test('a highlight runs along the bars while Claude works', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  engine(on, 'desktop')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(run('band'))
  await $.session.measure(MEASURE)

  const idle = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(String((await idle.find({ type: 'Svg' }))?.props.source)).not.toContain('class="sheen"')
  await idle.unmount()

  const ui = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, isWorking: true },
    surface: 'desktop',
  })
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('class="sheen"')
  await ui.unmount()
})

test('the terminal keeps text bars above the prompt', async ($, on) => {
  mock.clock(on)
  const pane = engine(on, 'terminal')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(MEASURE)

  expect(pane.isOpen).toBe(false)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const row = await ui.find({ type: 'Text', text: /Weekly limit/ })
  expect(row?.text).toMatch(/━+─+ +92%/)
  await ui.unmount()
})

test('/usage-bars moves the meters between the pane, the band and nowhere', async ($, on) => {
  mock.clock(on)
  const pane = engine(on, 'desktop')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE)

  const off = await $.command.run(run('off'))
  expect('text' in off ? off.text : '').toMatch(/hidden/)
  expect(pane.isOpen).toBe(false)
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()

  // No argument toggles: off goes to the side pane, the side pane to the band.
  await $.command.run(run(''))
  expect(pane.isOpen).toBe(true)
  await $.command.run(run(''))
  expect(pane.isOpen).toBe(false)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(3)
  await ui.unmount()
})

test('the context meter measures against the window the session compacts at', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  // A long-context model (a 1M window) in a session that compacts at 400k.
  engine(on, 'desktop', 400_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({ ...MEASURE, context: { tokens: 224_000, window: 1_000_000, percent: 22 } })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '224k of 400k' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '56%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /of 1M/ })).toBeUndefined()
  await ui.unmount()
})
