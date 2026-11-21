import { expect, test } from 'claude-code/testing'

const IDS = ['moonlit', 'clawd', 'cloud-drift', 'honu-lagoon', 'koi-pond', 'jellyfish', 'lantern-night', 'fireflies',
  'neon-rain', 'sakura-dusk', 'snow-cabin', 'star-voyage']

test('every wallpaper draws a Backdrop the desktop accepts', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  for (const scene of IDS) {
    const ui = await $.ui.mount({
      plugin: 'desktop-themes', component: 'Backdrop', requestId: `b-${scene}`, surface: 'desktop',
      props: { scene, plugin: 'desktop-themes', glass: { blur: 12, opacity: .4 } },
    })
    const svg = await ui.find({ type: 'Svg' })
    expect(svg).toBeDefined()
    await ui.unmount()
  }
})
