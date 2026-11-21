// A theme's three colors (bg, text, accent) as a whole Desktop palette, through the design system's makeColors.
import type { ThemeColors } from 'claude-code'

import type { Theme } from '../types'
import { makeColors } from './make-colors.js'

const rgb = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
const hex = (v: number[]) => '#' + v.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')
const mix = (a: string, b: string, k: number) => {
  const x = rgb(a), y = rgb(b)
  return hex(x.map((v, i) => v + (y[i]! - v) * k))
}
const luma = (c: string) => {
  const [r, g, b] = rgb(c).map(v => v / 255) as [number, number, number]
  return .2126 * r + .7152 * g + .0722 * b
}

export const modeOf = (t: Theme): 'light' | 'dark' => (luma(t.bg!) > .5 ? 'light' : 'dark')

export function colorsOf(t: Theme): { colors?: ThemeColors; problem?: string } {
  if (!t.bg || !t.text || !t.accent) return {}
  const mode = modeOf(t)
  const tx = t.text
  const roles = mode === 'dark'
    ? { accent: t.accent, danger: '#e5787a', success: '#b4ecbd', warning: '#e6b45e', pro: '#a99cf0' }
    : { accent: t.accent, danger: '#b3392f', success: '#3f7a3a', warning: '#a86f14', pro: '#6d4f94' }
  let last: { colors?: ThemeColors; problem?: string } = {}
  // a page too light (dark mode) or too dark (light mode) for the status colors: step it toward black/white and retry
  for (const k of [0, .2, .4]) {
    const bg = mix(t.bg, mode === 'dark' ? '#000000' : '#ffffff', k)
    // dark: each later surface a little lighter toward the text; light: a little lighter toward white
    const up = (s: number) => (mode === 'dark' ? mix(bg, tx, s) : mix(bg, '#ffffff', s))
    const anchors = {
      'surface-0': bg,
      'surface-1': up(.04),
      'surface-2': up(.08),
      ...(mode === 'dark' ? { 'surface-3': up(.1) } : {}),
      'text-primary': tx,
      'text-secondary': mix(tx, bg, .22),
      'text-muted': mix(tx, bg, .38),
    }
    try {
      const { theme, problems } = makeColors({
        label: t.name, id: t.id, only: mode, roles, [mode]: { gray: { anchors } },
      })
      last = { colors: theme, problem: problems.find(p => p.startsWith("Desktop won't paint")) }
      if (!last.problem) return last
    } catch (err) {
      last = { problem: String(err) }
    }
  }
  return last
}
