// themes-for-claude 0.8.0 (MIT, 0toshigami), moved onto Claude Desktop's own theme API: $.theme.set paints the
// colors, and the ASCII wallpapers draw as the Backdrop scene, one SVG frame per tick. No extension, no REACT_PROFILE.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Theme } from '../types'
import { colorsOf } from './look'
import { frame } from './render'
import { root } from './scenes.js'
import { THEMES, tile } from './themes'

type Motion = 'smooth' | 'grid'
type Tab = 'live' | 'color'
type Style = 'pixel' | 'ascii'
const LOOK = { style: 'pixel' as Style, motion: 'smooth' as Motion, speed: 4, cell: 10, veil: .4 }

const current = atom({ plugin: 'desktop-themes', key: 'current' } as const, 'claude')
const style = atom({ plugin: 'desktop-themes', key: 'style' } as const, LOOK.style)
const motion = atom({ plugin: 'desktop-themes', key: 'motion' } as const, LOOK.motion)
const speed = atom({ plugin: 'desktop-themes', key: 'speed' } as const, LOOK.speed)
const cell = atom({ plugin: 'desktop-themes', key: 'cell' } as const, LOOK.cell)
const veil = atom({ plugin: 'desktop-themes', key: 'veil' } as const, LOOK.veil)
const isStripOpen = atom({ plugin: 'desktop-themes', key: 'isStripOpen' } as const, false)
const tab = atom({ plugin: 'desktop-themes', key: 'tab' } as const, 'live' as Tab)
// bumped by the timer: the Backdrop hook reads it, so each bump draws the next frame
const tick = atom({ plugin: 'desktop-themes', key: 'frame' } as const, 0)

const STYLES: Record<Style, string> = { pixel: 'Pixel art', ascii: 'ASCII' }
const MOTIONS: Record<Motion, string> = { smooth: 'Smooth', grid: 'Cell by cell' }
const SPEEDS = [1, 2, 4, 8, 16]
const CELLS: Record<number, string> = { 8: 'Finest', 10: 'Fine', 14: 'Small', 18: 'Medium', 22: 'Large' }
const VEILS = [.2, .4, .6, .8]
const TABS: Record<Tab, string> = { live: 'Live wallpapers', color: 'Color themes' }
// how long one SVG is shown and how many frames it carries (render.ts steps through them): pixel art at 12.5 frames
// a second like a hand-made GIF, few swaps; ASCII at thirty a second, three frames in each tenth of a second
const PACE: Record<Style, { periodMs: number; most: number }> = { pixel: { periodMs: 800, most: 10 }, ascii: { periodMs: 100, most: 3 } }
let packing = PACE[LOOK.style]

const tabOf = (t: Theme): Tab => (t.wallpaper ? 'live' : 'color')
const byId = (id: string) => THEMES.find(t => t.id === id)

// the wallpaper's clock, in scene seconds: speed times wall time, three times as fast while Claude works
let sceneTime = 0
let working = false
let timer: Timer | undefined
let errorUntil = 0
let pace = LOOK.speed

const stopClock = () => {
  timer?.cancel()
  timer = undefined
}
const startClock = async ($: EngineInterface) => {
  stopClock()
  pace = await read($, speed)
  packing = PACE[await read($, style)]
  let last = await $.clock.now()
  timer = $.clock.every(packing.periodMs, () => {
    void (async () => {
      const now = await $.clock.now()
      sceneTime += Math.min(now - last, packing.periodMs * 2) / 1000 * pace * (working ? 3 : 1)
      last = now
      root.dataset.themeEvent = now < errorUntil ? 'error' : undefined
      await update($, tick, n => (n + 1) % 1_000_000)
    })().catch(() => {})
  })
}

// what the theme wears: its colors, and for a wallpaper the scene behind the chat
const wear = async ($: EngineInterface, t: Theme | undefined) => {
  if (!t || t.id === 'claude') {
    stopClock()
    await $.theme.clear()
    return
  }
  const { colors, problem } = colorsOf(t)
  if (problem) $.ui.toast(`${t.name}: ${problem}`)
  const glass = { blur: 12, tint: t.bg!, opacity: await read($, veil) }
  const set = await $.theme.set({
    ...(colors ? { colors } : {}),
    ...(t.wallpaper ? { backdrop: { scene: t.wallpaper, glass } } : { backdrop: { color: t.bg as `#${string}` } }),
  })
  if (!set.isDrawn) $.ui.status(set.reason)
  if (t.wallpaper) await startClock($)
  else stopClock()
}

const save = async ($: EngineInterface) => {
  await $.store.set('look', {
    current: await read($, current), style: await read($, style), motion: await read($, motion), speed: await read($, speed),
    cell: await read($, cell), veil: await read($, veil),
  })
}

const pick = async ($: EngineInterface, t: Theme) => {
  await update($, current, () => t.id)
  await wear($, t)
  await save($)
  $.ui.toast(`Theme: ${t.name}`)
}

// a wallpaper setting changed: save it and wear the theme again with it
const relook = async ($: EngineInterface, set: () => Promise<unknown>) => {
  await set()
  await save($)
  const now = byId(await read($, current))
  if (now?.wallpaper) await wear($, now)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'themes', description: 'Pick a theme for Claude Desktop' })
    try {
      const saved = ((await $.store.get('look')) ?? {}) as Partial<typeof LOOK & { current: string }>
      await update($, current, () => (typeof saved.current === 'string' && byId(saved.current) ? saved.current : 'claude'))
      await update($, style, () => (saved.style && Object.hasOwn(STYLES, saved.style) ? saved.style : LOOK.style))
      await update($, motion, () => (saved.motion && Object.hasOwn(MOTIONS, saved.motion) ? saved.motion : LOOK.motion))
      await update($, speed, () => (SPEEDS.includes(saved.speed ?? 0) ? saved.speed! : LOOK.speed))
      await update($, cell, () => (CELLS[saved.cell ?? 0] ? saved.cell! : LOOK.cell))
      await update($, veil, () => (VEILS.includes(saved.veil ?? 0) ? saved.veil! : LOOK.veil))
      const worn = byId(await read($, current))
      if (worn && worn.id !== 'claude') await wear($, worn)
    } catch {}
    return next(e)
  })

  on('command.run', { command: 'themes' }, async $ => {
    const open = await update($, isStripOpen, o => !o)
    if (open) {
      const worn = byId(await read($, current))
      await update($, tab, () => (worn && worn.id !== 'claude' ? tabOf(worn) : 'live'))
    }
    return { text: open ? 'Theme strip opened above the prompt.' : 'Theme strip closed.' }
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.plugin !== 'desktop-themes') return next(e)
    await read($, tick)
    const t = byId(await read($, current))
    const id = t?.wallpaper ?? e.props.scene
    const source = frame(id, sceneTime, {
      cell: await read($, cell), grid: (await read($, motion)) === 'grid', sky: t?.vars?.['wall-sky'] ?? t?.bg ?? '',
      span: packing.periodMs / 1000 * pace * (working ? 3 : 1), periodMs: packing.periodMs, most: packing.most,
      style: await read($, style),
    })
    if (!source) return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg source={source} alt={`${t?.name ?? 'Live'} wallpaper drawn in characters`} />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isStripOpen))) return next(e)
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Select } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const now = await read($, current)
    const move = await read($, motion)
    const drawn = await read($, style)
    const pace = await read($, speed)
    const size = await read($, cell)
    const shade = await read($, veil)
    const showing = await read($, tab)
    const worn = byId(now) ?? THEMES[0]!
    const shown = THEMES.filter(t => t.id !== 'claude' && tabOf(t) === showing)
    const tileOf = (t: Theme) => (
      <Box key={`tile-${t.id}`} hover={{ scope: `tip-${t.id}` }} flexDirection="column" alignItems="center" gap="xs">
        {Svg ? <Svg source={tile(t, t.id === now)} alt={`Preview of ${t.name}`} width={100} /> : null}
        <Button key={`use-${t.id}`} label={t.id === now ? `✓ ${t.name}` : t.name} dimColor={t.id !== now}
          variant={t.id === now ? 'primary' : undefined} hover={{ dimColor: false }} onPress={() => pick($, t)} />
      </Box>
    )
    const look = showing === 'live' || worn.wallpaper ? (
      <Box key="look" flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
        <Text dimColor>Wallpaper</Text>
        <Select key="style" label="Style" value={drawn}
          options={Object.entries(STYLES).map(([value, label]) => ({ value, label }))}
          onSelect={v => relook($, () => update($, style, () => (v === 'ascii' ? 'ascii' : 'pixel')))} />
        {drawn === 'pixel' ? null : <Select key="motion" label="Motion" value={move}
          options={Object.entries(MOTIONS).map(([value, label]) => ({ value, label }))}
          onSelect={v => relook($, () => update($, motion, () => (v === 'smooth' ? 'smooth' : 'grid')))} />}
        <Select key="speed" label="Speed" value={String(pace)}
          options={SPEEDS.map(s => ({ value: String(s), label: `${s}×` }))}
          onSelect={v => relook($, () => update($, speed, () => Number(v)))} />
        <Select key="cell" label="Size" value={String(size)}
          options={Object.entries(CELLS).map(([value, label]) => ({ value, label }))}
          onSelect={v => relook($, () => update($, cell, () => Number(v)))} />
        <Select key="veil" label="Chat backdrop" value={String(shade)}
          options={VEILS.map(v => ({ value: String(v), label: `${Math.round(v * 100)}%` }))}
          onSelect={v => relook($, () => update($, veil, () => Number(v)))} />
      </Box>
    ) : null
    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Box flexDirection="row" flexShrink={1} gap={1} alignItems="center">
            <Text weight="semibold">Themes</Text>
            <Text dimColor>Wearing</Text>
            {Svg ? <Svg source={tile(worn, false)} alt={`Preview of ${worn.name}`} width={48} /> : null}
            <Text weight="semibold">{worn.name}</Text>
            {shown.map(t => (
              <Box key={`tip-${t.id}`} display="none" hover={{ scope: `tip-${t.id}`, display: 'flex' }} flexShrink={1}>
                <Text dimColor italic wrap="truncate-end">{`  —  ${t.name}: ${t.tagline}`}</Text>
              </Box>
            ))}
          </Box>
          <Button key="close" role="dismiss" label="Close" onPress={() => update($, isStripOpen, () => false)} />
        </Box>
        <Box key="tabs" flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Box flexDirection="row" gap="xs">
            {(Object.keys(TABS) as Tab[]).map(k => (
              <Button key={`tab-${k}`} label={worn.id !== 'claude' && k === tabOf(worn) ? `● ${TABS[k]}` : TABS[k]}
                variant={k === showing ? 'primary' : undefined} dimColor={k !== showing} onPress={() => update($, tab, () => k)} />
            ))}
          </Box>
          <Button key="claude" label={now === 'claude' ? "✓ Claude's own" : "Claude's own"} dimColor={now !== 'claude'}
            onPress={() => pick($, THEMES[0]!)} />
        </Box>
        {look}
        <Box key="tiles" flexDirection="row" flexWrap="wrap" gap={1}>
          {shown.map(tileOf)}
        </Box>
      </Box>
    )
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) working = true
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (result.isError) errorUntil = Date.now() + 1200
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) working = false
    return next(e)
  })
}
