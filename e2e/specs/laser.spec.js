import { test, expect } from '../helpers/fixtures.js'
import { SURFACE, surfaceBox, toolByIcon } from '../helpers/editor.js'

// The laser pointer (#41): a presentation aid that must leave a short trail behind
// the moving pointer, fade it out on its own, and never write anything to the
// document. Before the fix it rendered a single dot with no trail at all, which no
// spec caught — so the trail is asserted from the DOM (it is transient by design and
// therefore invisible to the persisted-document assertions used everywhere else),
// and the "never persists" half is asserted from the saved document.

const TRAIL = `${SURFACE} path[stroke="#E03636"]`

// Sweep the pointer without pressing: the laser follows hover, like a real one.
async function sweep(page, steps = 12) {
  const box = await surfaceBox(page)
  const y = box.y + box.height / 2
  for (let i = 0; i <= steps; i += 1) {
    await page.mouse.move(box.x + 200 + (i * 300) / steps, y)
  }
}

test.describe('laser pointer', () => {
  test('leaves a fading trail behind the pointer, then clears itself', async ({ page, diagram }) => {
    await diagram.open('whiteboard', { empty: true })
    await toolByIcon(page, 'zap').click()

    // Sweep and read the trail inside ONE poll: the trail is alive for well under a
    // second, so a sweep followed by a separate read races its own fade. More than
    // one segment IS the trail (a single dot — the old behavior — renders no trail
    // path at all), and the oldest segment being fainter than the newest is the fade.
    await expect.poll(async () => {
      await sweep(page)
      const opacities = await page.locator(TRAIL).evaluateAll((nodes) =>
        nodes.map((node) => Number(node.getAttribute('stroke-opacity'))),
      )
      return opacities.length > 1 && opacities[0] < opacities[opacities.length - 1]
    }, { message: 'the laser left no fading trail behind the pointer' }).toBe(true)

    // With the pointer still, the trail fades out entirely (self-fading, spec C5).
    await expect.poll(() => page.locator(TRAIL).count(), {
      message: 'the laser trail never faded away after the pointer stopped',
      timeout: 5_000,
    }).toBe(0)
  })

  test('draws nothing into the document', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { empty: true })
    await toolByIcon(page, 'zap').click()

    // Press and drag too: a laser gesture must stay transient even when it looks
    // exactly like a pen stroke.
    const box = await surfaceBox(page)
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.down()
    await sweep(page)
    await page.mouse.up()

    const saved = await diagram.saved(name)
    expect(saved.whiteboard.strokes).toHaveLength(0)
    expect(saved.whiteboard.lines || []).toHaveLength(0)
  })
})
