// A wallpaper as SVG: the extension's canvas `draw`, ported, in two styles. `ascii` is the original: glyphs on tiles
// with gaps and a faint grid. `pixel` is solid pixel art: every cell a full square of its color, no glyphs, no grid,
// sprites stepped a whole pixel at a time. The viewBox is in cells, so coordinates are short; cells of one color and
// opacity share one <path> (and in ascii one <text> a row). A redraw is ten a second at most, so each SVG holds
// several frames that CSS steps through until the next one replaces it.
import { GLYPHS, LOOSE, SCENES, glyph, haloOf } from './scenes.js'
import type { Cell } from './scenes.js'

export const VIEW_W = 1600
export const VIEW_H = 1000
const LIMIT = 125_000

export type FrameOpts = {
  cell: number
  grid: boolean
  sky: string
  // scene seconds this SVG covers, and the wall-clock milliseconds it is shown for
  span: number
  periodMs: number
  // at most this many frames in one SVG
  most?: number
  style: 'pixel' | 'ascii'
}

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
// (only the five named references: the Backdrop refuses numeric ones)
const esc = (s: string) => s.replace(/[&<>"]/g, c => ENT[c]!)
const n2 = (v: number) => String(Math.round(v * 100) / 100)
const q = (a: number) => Math.round(Math.max(0, Math.min(1, a)) * 20) / 20
// a CSS background from a theme: only gradients and hex/rgba colors pass (no url, no escapes)
const safeSky = (s: string) => (/^[\w\s#%.,()-]+$/.test(s) && !/url|image|expression/i.test(s) ? s : '')

type Run = { xs: string[]; ch: string }
// a horizontal run of tiles: drawn as one dashed stroke, each dash one tile with a gap after it
type Tiles = { runs: [number, number, number][] }

// one frame's elements, in cell units
// cls names a CSS class for a color and opacity, shared by every frame in the SVG
function body(id: string, t: number, cols: number, rows: number, grid: boolean, floor: number, pixel: boolean,
  cls: (kind: 'c' | 'k', color: string, a: string) => string): string {
  const scene = SCENES[id]!
  // texts by color, opacity and row: one <text> per row holds its x list
  const texts = new Map<string, Run[]>()
  const tiles = new Map<string, Tiles>()
  const glows: string[] = []

  const put = (cx: number, cy: number, c: Cell, sx: number, sy: number) => {
    const a = q(c.a)
    if (a < floor) return
    // pixel art: a glyph-only cell (a star, a raindrop) is a pixel of its glyph's color
    const color = pixel ? c.bg ?? c.fg : c.bg
    if (color) {
      const k = `${color}|${a}`
      const p = tiles.get(k) ?? tiles.set(k, { runs: [] }).get(k)!
      const x = Math.round(cx * 100) / 100, y = Math.round(cy * 100) / 100
      const last = p.runs[p.runs.length - 1]
      if (last && last[1] === y && Math.abs(last[0] + last[2] - x) < .001) last[2]++
      else p.runs.push([x, y, 1])
    }
    if (pixel) return
    const ch = c.ch ?? glyph(c.bg ? GLYPHS : LOOSE, sx, sy, t)
    if (!ch || ch === ' ') return
    const k = `${c.fg}|${a}|${n2(cy + .5)}`
    const runs = texts.get(k) ?? texts.set(k, []).get(k)!
    let run = runs[runs.length - 1]
    // a "/" next to a "*" would read as a CSS comment: start a new run between them
    const prev = run?.ch.slice(-1)
    if (!run || (prev === '/' && ch === '*') || (prev === '*' && ch === '/')) runs.push(run = { xs: [], ch: '' })
    run.xs.push(n2(cx + .5))
    run.ch += ch
  }

  if (scene.cell)
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const c = scene.cell(x, y, cols, rows, t)
        if (c) put(x, y, c, x, y)
      }

  for (const s of scene.sprites?.(cols, rows, t) ?? []) {
    const ox = grid ? Math.round(s.x) : s.x, oy = grid ? Math.round(s.y) : s.y
    const m = s.a ?? 1, k = s.key * 997
    const bw = s.art ? s.art[0]!.length : s.w ?? 0, bh = s.art ? s.art.length : s.h ?? 0
    if (ox > cols + 4 || oy > rows + 4 || ox + bw + 4 < 0 || oy + bh + 4 < 0) continue
    if (s.glow && /^#[0-9a-fA-F]{6}$/.test(s.glow.color))
      glows.push(`<circle cx="${n2(ox + bw / 2)}" cy="${n2(oy + bh / 2)}" r="${n2(s.glow.r)}" fill="${s.glow.color}" opacity="${q(s.glow.a)}"/>`)
    const cells: [number, number, Cell, number, number][] = []
    if (s.art && s.pal) {
      s.art.forEach((row, gy) => {
        for (let gx = 0; gx < row.length; gx++) {
          const c = s.pal![row[gx]!]
          if (c) cells.push([gx, gy, c, gx + k, gy])
        }
      })
    } else if (s.field)
      for (let gy = 0; gy < bh; gy++)
        for (let gx = 0; gx < bw; gx++) {
          const f = s.field(gx, gy)
          if (f) cells.push([gx, gy, f.c, (f.sx ?? gx) + k, f.sy ?? gy])
        }
    if (s.shadow)
      for (const [gx, gy, c] of cells)
        if (c.bg) put(ox + gx + (pixel ? 1 : .8), oy + gy + (pixel ? 1 : .8), { bg: s.shadow, fg: s.shadow, ch: '', a: .4 * m }, 0, 0)
    if (s.halo && s.art)
      for (const [gx, gy] of haloOf(s.art)) put(ox + gx, oy + gy, { fg: s.halo, a: .3 * m }, gx + k, gy)
    for (const [gx, gy, c, sx, sy] of cells) put(ox + gx, oy + gy, m === 1 ? c : { ...c, a: c.a * m }, sx, sy)
  }

  return [
    glows.length ? `<g filter="url(#b)" style="mix-blend-mode:screen">${glows.join('')}</g>` : '',
    ...[...tiles].map(([k, p]) => {
      const [stroke, a] = k.split('|')
      let d = '', px = 0, py = 0
      for (const [x, y, n] of p.runs) {
        // (each subpath restarts the dashes, so every run starts on a whole tile)
        const ox = pixel ? x : x + .1, oy = y + .5
        d += d ? `m${n2(ox - px)} ${n2(oy - py)}h${n}` : `M${n2(ox)} ${n2(oy)}h${n}`
        px = ox + n
        py = oy
      }
      return `<path class="${cls('k', stroke!, a!)}" d="${d}"/>`
    }),
    ...[...texts].flatMap(([k, runs]) => {
      const [fill, a, y] = k.split('|')
      const c = cls('c', fill!, a!)
      return runs.map(r => `<text class="${c}" y="${y}" x="${r.xs.join(' ')}">${esc(r.ch)}</text>`)
    }),
  ].join('')
}

export function frame(id: string, t: number, o: FrameOpts): string | undefined {
  const scene = SCENES[id]
  if (!scene) return undefined
  const C = Math.min(o.cell, scene.size ?? 22)
  const cols = Math.ceil(VIEW_W / C), rows = Math.ceil(VIEW_H / C)
  const sky = safeSky(o.sky)
  let lines = ''
  for (let x = 0; x <= cols; x++) lines += `M${x} 0V${rows}`
  for (let y = 0; y <= rows; y++) lines += `M0 ${y}H${cols}`
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols} ${rows}" preserveAspectRatio="xMidYMid slice">`
  const defs = '<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>'
  const pixel = o.style === 'pixel'
  const grid = pixel || o.grid
  const base = pixel ? '' : `<path d="${lines}" style="stroke:#a0b4ff;stroke-opacity:.05;stroke-width:.07;stroke-dasharray:none"/>`

  // classes for each color and opacity; bodies kept by time and floor, so a retry never draws a frame twice
  const classes = new Map<string, string>()
  const cls = (kind: 'c' | 'k', color: string, a: string) => {
    const key = `${kind}|${color}|${a}`
    let name = classes.get(key)
    if (!name) classes.set(key, name = `${kind}${classes.size.toString(36)}`)
    return name
  }
  const bodies = new Map<string, string>()
  const bodyAt = (st: number, floor: number) => {
    const key = `${st.toFixed(6)}|${floor}`
    let b = bodies.get(key)
    if (b === undefined) bodies.set(key, b = body(id, st, cols, rows, grid, floor, pixel, cls))
    return b
  }

  for (const floor of [0.01, 0.15, 0.3])
    // fewer frames when they do not fit, each set a subset of the last so its frames are already drawn
    for (const k of [...new Set([o.most ?? 3, Math.ceil((o.most ?? 3) / 2), 2, 1])].filter(n => n >= 1 && n <= (o.most ?? 3))) {
      const slot = Math.round(o.periodMs / k)
      const frames = Array.from({ length: k }, (_, i) =>
        `<g${k > 1 ? ` class="f${i}"` : ''}>${bodyAt(t + o.span * i / k, floor)}</g>`)
      // frame i shows from i slots in to i + 1 (the last one stays until the next SVG replaces this one)
      const steps = Array.from({ length: k }, (_, i) => {
        if (k === 1) return ''
        const on = i === 0 ? '' : 'visibility:hidden;'
        const anims = [i > 0 ? `s 0s ${i * slot}ms forwards` : '', i < k - 1 ? `h 0s ${(i + 1) * slot}ms forwards` : '']
        return `.f${i}{${on}animation:${anims.filter(Boolean).join(',')}}`
      }).join('')
      const palette = [...classes].map(([key, name]) => {
        const [kind, color, a] = key.split('|')
        return kind === 'c' ? `.${name}{fill:${color};fill-opacity:${a}}` : `.${name}{stroke:${color};stroke-opacity:${a}}`
      }).join('')
      const style = `<style>svg{background:${sky || 'transparent'}}`
        + 'text{font:bold .6px Menlo,Consolas,monospace;text-anchor:middle;dominant-baseline:central;white-space:pre}'
        + (pixel ? 'path{fill:none;stroke-width:1.03}' : 'path{fill:none;stroke-width:.8;stroke-dasharray:.8 .2}')
        + palette
        + (k > 1 ? `@keyframes s{to{visibility:visible}}@keyframes h{to{visibility:hidden}}${steps}` : '')
        + '</style>'
      const svg = `${head}${style}${defs}${base}${frames.join('')}</svg>`
      if (svg.length <= LIMIT) return svg
    }
  return undefined
}
