export type Limit = { kind: string; percentUsed: number; resetsAt: string | null }

export type Snapshot = {
  contextPercent: number | null
  contextTokens: number | null
  contextWindow: number
  limits: Limit[]
  costUsd: number | null
  /** What each meter (by key) showed before the last change, for the bar to grow from. */
  previous: Record<string, number>
  /** `$.clock.now()` when the last change landed. */
  changedAt: number
}

/**
 * The window the context meter measures against, as /context does: the
 * model's limit, or a smaller compaction window. Kept with the model's full
 * window it was read for, so it is read again only when the model changes.
 */
export type ContextMax = { forWindow: number; max: number }

/**
 * Where the meters show: `side`, the docked pane; `band`, above the prompt;
 * `off`, nowhere; `auto`, the default, above the prompt.
 */
export type Mode = 'auto' | 'side' | 'band' | 'off'

declare module 'claude-code' {
  interface PluginState {
    'limit-lines': {
      snapshot: Shaped<Snapshot | null>
      mode: Shaped<Mode>
      contextMax: ContextMax | null
      /** True once the side pane is drawn, so the band stands aside. */
      isDocked: boolean
      /** True while a main-loop turn runs: the pane has no prop that says so. */
      isWorking: boolean
    }
  }
}
