export type Theme = {
  id: string
  name: string
  tagline: string
  bg?: string
  text?: string
  accent?: string
  font?: string
  vars?: Record<string, string>
  deco?: string
  wallpaper?: string
  thumb?: string
  css?: string
}

declare module 'claude-code' {
  interface PluginState {
    'desktop-themes': {
      current: string
      style: 'pixel' | 'ascii'
      motion: 'smooth' | 'grid'
      speed: number
      cell: number
      veil: number
      isStripOpen: boolean
      tab: 'live' | 'color'
      frame: number
    }
  }
}
