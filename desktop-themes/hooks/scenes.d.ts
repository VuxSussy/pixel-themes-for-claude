export type Cell = { ch?: string; fg: string; bg?: string; a: number; floor?: number }
export type Sprite = {
  x: number
  y: number
  key: number
  a?: number
  art?: string[]
  pal?: Record<string, Cell>
  w?: number
  h?: number
  field?: (gx: number, gy: number) => { c: Cell; sx?: number; sy?: number } | undefined
  halo?: string
  shadow?: string
  glow?: { r: number; color: string; a: number }
}
export type Scene = {
  size?: number
  cell?: (x: number, y: number, cols: number, rows: number, t: number) => Cell | undefined
  sprites?: (cols: number, rows: number, t: number) => Sprite[]
}
export const SCENES: Record<string, Scene>
export const root: { dataset: Record<string, string | undefined> }
export const GLYPHS: string
export const LOOSE: string
export function glyph(set: string, x: number, y: number, t: number): string
export function haloOf(art: string[]): [number, number][]
