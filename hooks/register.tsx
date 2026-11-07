import { atom, read, update } from 'claude-code'
import type {
  ElementTable,
  EngineInterface,
  Register,
  SessionMeasureInput,
  SessionUsage,
} from 'claude-code'

import type { ContextMax, Mode, Snapshot } from '../types'

const PANE = 'limit-lines'
const TITLE = 'Usage'

// Bump the tag when Snapshot's fields change: a value an older version
// stored is then read as null instead of being drawn with missing fields.
const snapshot = atom({ plugin: 'limit-lines', key: 'snapshot' } as const, null, {
  shape: 'snapshot-2',
})
// The tag resets a choice an older version stored (the side pane, say) once,
// so the meters come back above the prompt.
const mode = atom({ plugin: 'limit-lines', key: 'mode' } as const, 'auto' as Mode, {
  shape: 'mode-2',
})
const contextMax = atom({ plugin: 'limit-lines', key: 'contextMax' } as const, null as ContextMax | null)
const isDocked = atom({ plugin: 'limit-lines', key: 'isDocked' } as const, false)
const isWorking = atom({ plugin: 'limit-lines', key: 'isWorking' } as const, false)

type Level = 'ok' | 'warn' | 'high'

type Meter = {
  key: string
  label: string
  percent: number
  from: number
  detail: string
}

/** Seconds a bar takes to settle on a new value. */
const SETTLE = 1.1
/** A line's thickness in pixels; its ends are half that in radius. */
const LINE = 4

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LABELS: Record<string, string> = {
  five_hour: '5-hour limit',
  seven_day: 'Weekly limit',
  spend_limit: 'Spend limit',
}
const THEME: Record<Level, 'success' | 'warning' | 'error'> = {
  ok: 'success',
  warn: 'warning',
  high: 'error',
}

const levelOf = (percent: number): Level =>
  percent >= 85 ? 'high' : percent >= 60 ? 'warn' : 'ok'

const clamp = (n: number) => Math.min(100, Math.max(0, n))
const round1 = (n: number) => Math.round(n * 10) / 10
const pct = (n: number) => `${Math.round(n)}%`

const tokens = (n: number) =>
  n >= 1_000_000
    ? `${+(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}k`
      : `${n}`

const resetText = (iso: string | null, kind: string) => {
  if (iso === null) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const hour = at.getHours()
  const time = `${hour % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`

  return kind === 'five_hour' ? `resets ${time}` : `resets ${DAYS[at.getDay()]} ${time}`
}

const percentsOf = (s: Snapshot): Record<string, number> => {
  const out: Record<string, number> = { context: s.contextPercent ?? 0 }
  for (const l of s.limits) out[l.kind] = l.percentUsed

  return out
}

/**
 * `max` is the window the session compacts against (see `maxOf`); without
 * it the meter falls back to the model's full window and the engine's percent.
 */
const toSnapshot = (
  u: SessionMeasureInput | SessionUsage,
  previous: Record<string, number>,
  changedAt: number,
  max: number | null,
): Snapshot => {
  const used = u.context.tokens

  return {
    contextPercent:
      used === undefined ? null : max === null ? (u.context.percent ?? null) : round1((used / max) * 100),
    contextTokens: used ?? null,
    contextWindow: max ?? u.context.window,
    limits: u.rateLimits.map(r => ({
      kind: r.kind,
      percentUsed: r.percentUsed,
      resetsAt: r.resetsAt ?? null,
    })),
    costUsd: u.cost?.usd ?? null,
    previous,
    changedAt,
  }
}

/**
 * The window the context actually fills, as /context measures it: the
 * model's limit, or a smaller compaction window. `context.window` is always
 * the model's full limit (1M on a long-context model), which overstates the
 * room when the session compacts sooner. The figure comes from the engine's
 * local estimate (no API request), read once per model and kept.
 */
const maxOf = async ($: EngineInterface, modelWindow: number): Promise<number | null> => {
  const kept = await read($, contextMax)
  if (kept !== null && kept.forWindow === modelWindow) return kept.max

  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    const max = usage.context.breakdown?.rawMaxTokens
    if (max === undefined || max <= 0) return null
    await update($, contextMax, () => ({ forWindow: modelWindow, max }))

    return max
  } catch {
    // No breakdown to be had (no session bound yet): the model's window stands.
    return null
  }
}

const metersOf = (s: Snapshot): Meter[] => {
  const context: Meter = {
    key: 'context',
    label: 'Context',
    percent: s.contextPercent ?? 0,
    from: s.previous.context ?? 0,
    detail:
      s.contextTokens === null
        ? `${tokens(s.contextWindow)} window`
        : `${tokens(s.contextTokens)} of ${tokens(s.contextWindow)}`,
  }
  const limits = s.limits.map(
    (l): Meter => ({
      key: l.kind,
      label: LABELS[l.kind] ?? l.kind.replace(/_/g, ' '),
      percent: l.percentUsed,
      from: s.previous[l.kind] ?? 0,
      detail: resetText(l.resetsAt, l.kind),
    }),
  )

  return [context, ...limits]
}

// ---------------------------------------------------------------------------
// Drawing. Apple's system colours, light and dark, are picked inside each SVG
// so it follows the appearance the app is in.

// Each level is a pair the fill flows between: blue into cyan, orange into
// yellow, red into pink.
const PALETTE =
  ':root{--track:rgba(120,120,128,.2);' +
  '--ok-a:#007AFF;--ok-b:#5AC8FA;--warn-a:#FF9500;--warn-b:#FFCC00;--high-a:#FF3B30;--high-b:#FF2D55;' +
  '--sheen:.6}' +
  '@media (prefers-color-scheme:dark){:root{--track:rgba(120,120,128,.36);' +
  '--ok-a:#0A84FF;--ok-b:#64D2FF;--warn-a:#FF9F0A;--warn-b:#FFD60A;--high-a:#FF453A;--high-b:#FF375F;' +
  '--sheen:.4}}'

/** Seconds the gradient takes to flow one full length. */
const FLOW = 3
/** How much of the track one run of the gradient spans, in percent. */
const FLOW_SPAN = 60

/**
 * The fill's gradient, `url(#flow)`: the level's two colours repeating along
 * the track and sliding rightward forever. It spans the whole track, not the
 * filled part, so a short fill flows at the same pace as a long one.
 */
const FLOW_GRADIENT =
  `<linearGradient id="flow" gradientUnits="userSpaceOnUse" spreadMethod="repeat" ` +
  `y1="0" y2="0" x1="0%" x2="${FLOW_SPAN}%">` +
  `<stop offset="0" class="a"/><stop offset=".5" class="b"/><stop offset="1" class="a"/>` +
  `<animate attributeName="x1" values="0%;${FLOW_SPAN}%" dur="${FLOW}s" repeatCount="indefinite"/>` +
  `<animate attributeName="x2" values="${FLOW_SPAN}%;${2 * FLOW_SPAN}%" dur="${FLOW}s" repeatCount="indefinite"/>` +
  `</linearGradient>`

/** The white band the highlight sweeps along the fill with, `url(#g)`. */
const SHEEN_GRADIENT =
  `<linearGradient id="g" x1="0" y1="0" x2="1" y2="0">` +
  `<stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
  `<stop offset=".5" stop-color="#fff" stop-opacity="1"/>` +
  `<stop offset="1" stop-color="#fff" stop-opacity="0"/>` +
  `</linearGradient>`

/**
 * The motion a bar draws with. `elapsed` is how long ago the value changed:
 * the motion starts that far in, so a redraw mid-way (the turn ending, say)
 * continues it rather than restarting, and a value that settled a while ago
 * draws still.
 */
const motionOf = (m: Meter, elapsed: number) => {
  const to = round1(clamp(m.percent))
  const from = round1(clamp(m.from))
  const isMoving = elapsed < SETTLE && from !== to
  // A spring's small overshoot past the target, then the settle back.
  const push = Math.min(2.5, Math.abs(to - from) * 0.06) * Math.sign(to - from)
  const peak = round1(clamp(to + push))
  const begin = `${-round1(elapsed)}s`
  const level = levelOf(to)
  const wasLevel = levelOf(from)
  // The gradient's two colours, fading from the old level's pair when the
  // value crosses into another level.
  const ease = `${SETTLE}s cubic-bezier(.16,1,.3,1) ${begin} both`
  const tint =
    `.a{stop-color:var(--${level}-a)}.b{stop-color:var(--${level}-b)}` +
    (isMoving && level !== wasLevel
      ? `.a{animation:tint-a ${ease}}.b{animation:tint-b ${ease}}` +
        `@keyframes tint-a{from{stop-color:var(--${wasLevel}-a)}to{stop-color:var(--${level}-a)}}` +
        `@keyframes tint-b{from{stop-color:var(--${wasLevel}-b)}to{stop-color:var(--${level}-b)}}`
      : '')
  const animate = (attribute: string, values: (p: number) => string) =>
    isMoving
      ? `<animate attributeName="${attribute}" values="${values(from)};${values(peak)};${values(to)}" ` +
        `keyTimes="0;0.72;1" calcMode="spline" keySplines="0.2 0.9 0.3 1;0.4 0 0.2 1" ` +
        `dur="${SETTLE}s" begin="${begin}" fill="freeze"/>`
      : ''

  return { to, tint, animate }
}

const titleOf = (m: Meter) =>
  `<title>${m.label}: ${pct(m.percent)} used${m.detail ? `, ${m.detail}` : ''}</title>`

/**
 * A meter as a thin line: the fill grows in from the left, its colours flow
 * along it, and a highlight runs down it while Claude works. No viewBox:
 * lengths are percentages of the width the app gives it, or a fixed pixel
 * radius, so the ends stay round at any width.
 */
const lineSvg = (m: Meter, elapsed: number, working: boolean) => {
  const { to, tint, animate } = motionOf(m, elapsed)
  const r = LINE / 2
  const grow = animate('width', p => `${p}%`)
  const band = round1(Math.max(8, to * 0.45))
  const sheen =
    working && to > 0
      ? `<g clip-path="url(#c)"><rect class="sheen" width="${band}%" height="100%" fill="url(#g)">` +
        `<animate attributeName="x" values="${-band}%;${to}%" dur="1.8s" calcMode="spline" ` +
        `keyTimes="0;1" keySplines="0.45 0 0.25 1" repeatCount="indefinite"/></rect></g>`
      : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${LINE}">${titleOf(m)}` +
    `<style>${PALETTE}svg{display:block;width:100%;height:100%;overflow:hidden}` +
    `.track{fill:var(--track)}.fill{fill:url(#flow)}.sheen{opacity:var(--sheen)}${tint}</style>` +
    `<defs>${SHEEN_GRADIENT}${FLOW_GRADIENT}` +
    `<clipPath id="c"><rect width="${to}%" height="100%" rx="${r}">${grow}</rect></clipPath></defs>` +
    `<rect class="track" width="100%" height="100%" rx="${r}"/>` +
    `<rect class="fill" width="${to}%" height="100%" rx="${r}">${grow}</rect>${sheen}</svg>`
  )
}

type MeterElements = Pick<ElementTable<'desktop'>, 'Box' | 'Text' | 'Svg'>

/**
 * One meter in two rows: the label, its detail and the percent, then the
 * animated line. The detail gives way first when the row runs short. The
 * band lays three side by side above the prompt; the pane stacks them.
 */
const lineMeter = ({ Box, Text, Svg }: MeterElements, m: Meter, elapsed: number, working: boolean) => (
  <Box flexDirection="column" gap="xs" minWidth={0}>
    <Box flexDirection="row" alignItems="flex-end" gap="sm" minWidth={0}>
      <Box flexShrink={1} minWidth={0}>
        <Text size="footnote" weight="medium" dimColor wrap="truncate">
          {m.label}
        </Text>
      </Box>
      {/* Starting from no width, the detail only takes the room the label and
          percent leave, so it is cut first and the label only once it is gone. */}
      <Box flexGrow={1} flexShrink={1} width={0} minWidth={0}>
        <Text size="caption" dimColor wrap="truncate">
          {m.detail}
        </Text>
      </Box>
      <Text
        size="footnote"
        weight="semibold"
        tabular
        color={levelOf(m.percent) === 'high' ? 'error' : undefined}
      >
        {pct(m.percent)}
      </Text>
    </Box>
    <Svg
      source={lineSvg(m, elapsed, working)}
      alt={`${m.label}: ${pct(m.percent)} used${m.detail ? `, ${m.detail}` : ''}`}
      height={LINE}
      isInteractive
    />
  </Box>
)

const lineBar = (percent: number, width: number) => {
  const filled = Math.round((clamp(percent) / 100) * width)

  return ['━'.repeat(filled), '─'.repeat(width - filled)] as const
}

/** Only an explicit `/limit-lines side` docks the meters; otherwise they sit above the prompt. */
const wantsSide = (m: Mode) => m === 'side'

const ARGS: Record<string, Mode> = {
  side: 'side',
  pane: 'side',
  left: 'side',
  right: 'side',
  band: 'band',
  bar: 'band',
  prompt: 'band',
  off: 'off',
  hide: 'off',
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'limit-lines',
      description: 'Show usage in the side pane, above the prompt, or nowhere',
      argumentHint: 'side | band | off',
    })
    const usage = await $.session.usage()
    const now = await $.clock.now()
    const max = await maxOf($, usage.context.window)
    // An empty `previous` grows every bar in from zero as the session opens.
    await update($, snapshot, () => toSnapshot(usage, {}, now, max))
    await update($, isWorking, () => false)

    if (wantsSide(await read($, mode))) {
      const opened = await $.ui.open({ id: PANE, title: TITLE })
      await update($, isDocked, () => opened.isPlaced)
    } else if (await read($, isDocked)) {
      // A pane an earlier version opened goes; the band takes over.
      await $.ui.close({ id: PANE })
      await update($, isDocked, () => false)
    }

    return started
  })

  on('session.attach', async ($, e, next) => {
    if (e.surface === 'desktop' && wantsSide(await read($, mode))) {
      const opened = await $.ui.open({ id: PANE, title: TITLE })
      await update($, isDocked, () => opened.isPlaced)
    }

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    const max = await maxOf($, e.context.window)
    await update($, snapshot, old => toSnapshot(e, old ? percentsOf(old) : {}, now, max))

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isWorking, () => true)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isWorking, () => false)

    return next(e)
  })

  // This hook only notes the close; should it fail, the close still goes on.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      await update($, isDocked, () => false)
      // Closed by hand: the meters move back above the prompt.
      if (e.origin.kind === 'person') await update($, mode, () => 'band')
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'limit-lines' }, async ($, e) => {
    const current = await read($, mode)
    const effective = current === 'auto' ? 'band' : current
    const asked = ARGS[e.args.trim().toLowerCase()]
    const chosen: Mode = asked ?? (effective === 'side' ? 'band' : 'side')
    await update($, mode, () => chosen)

    if (chosen !== 'side') {
      await $.ui.close({ id: PANE })
      await update($, isDocked, () => false)

      return {
        text:
          chosen === 'band'
            ? 'Usage now shows above the prompt.'
            : 'Usage hidden. Run /limit-lines to bring it back.',
      }
    }

    const opened = await $.ui.open({ id: PANE, title: TITLE })
    await update($, isDocked, () => opened.isPlaced)

    return {
      text: opened.isPlaced
        ? 'Usage now shows in the side pane.'
        : `The side pane could not open (${opened.reason}), so usage stays above the prompt.`,
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    const where = await read($, mode)
    const docked = await read($, isDocked)

    if (e.props.hasSurvey || snap === null || where === 'off') {
      return next(e)
    }

    // While the side pane is up, the band stands aside.
    if (where !== 'band' && docked) {
      const panes = await $.ui.panes()
      if (panes.some(p => p.id === PANE && p.isPlaced)) return next(e)
    }

    const meters = metersOf(snap)

    if (e.surface === 'desktop') {
      const ui = $.ui.resolve(e)
      const { Box } = ui
      const elapsed = Math.max(0, ((await $.clock.now()) - snap.changedAt) / 1000)

      return (
        <Box flexDirection="row" gap="xl" paddingX="md" paddingY="xs">
          {meters.map(m => (
            <Box flexDirection="column" flexGrow={1} flexShrink={1} width={0} minWidth={0}>
              {lineMeter(ui, m, elapsed, e.props.isWorking)}
            </Box>
          ))}
        </Box>
      )
    }

    const { Box, Text } = $.ui.resolve(e)
    const labelWidth = Math.max(...meters.map(m => m.label.length))
    const barWidth = Math.max(10, Math.min(30, e.props.bodyColumns - labelWidth - 28))

    return (
      <Box flexDirection="column">
        {meters.map(m => {
          const [filled, empty] = lineBar(m.percent, barWidth)

          return (
            <Text wrap="truncate">
              <Text dimColor>{m.label.padEnd(labelWidth)} </Text>
              <Text color={THEME[levelOf(m.percent)]}>{filled}</Text>
              <Text dimColor>{empty}</Text>
              <Text bold> {pct(m.percent).padStart(4)}</Text>
              <Text dimColor>  {m.detail}</Text>
            </Text>
          )
        })}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const snap = await read($, snapshot)
    const working = await read($, isWorking)

    if (e.surface === 'desktop' || e.surface === 'vscode' || e.surface === 'mobile') {
      const ui = $.ui.resolve(e)
      const { Box, Text } = ui

      if (snap === null) {
        return (
          <Box padding="md">
            <Text size="footnote" dimColor>
              Usage shows after the first reply.
            </Text>
          </Box>
        )
      }

      const elapsed = Math.max(0, ((await $.clock.now()) - snap.changedAt) / 1000)

      return (
        <Box flexDirection="column" gap="lg" padding="md">
          {metersOf(snap).map(m => lineMeter(ui, m, elapsed, working))}
          {snap.costUsd !== null && (
            <Text size="caption" dimColor>
              This session: ${snap.costUsd.toFixed(2)} at API rates
            </Text>
          )}
        </Box>
      )
    }

    const { Box, Text } = $.ui.resolve(e)

    if (snap === null) {
      return <Text dimColor>Usage shows after the first reply.</Text>
    }

    const meters = metersOf(snap)
    const barWidth = Math.max(8, e.props.bodyColumns - 6)

    return (
      <Box flexDirection="column" gap="sm">
        {meters.map(m => {
          const [filled, empty] = lineBar(m.percent, barWidth)

          return (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text dimColor>{m.label}</Text>
                <Text bold>{pct(m.percent)}</Text>
              </Box>
              <Text>
                <Text color={THEME[levelOf(m.percent)]}>{filled}</Text>
                <Text dimColor>{empty}</Text>
              </Text>
              <Text dimColor>{m.detail}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
