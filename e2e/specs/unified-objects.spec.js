import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import {
  SURFACE,
  MM_TOOLBAR,
  clickNode,
  mindmapNode,
  flowchartNode,
  boxInWindow,
  dragNode,
} from '../helpers/editor.js'

// THE untested seam of the unified canvas.
//
// legacy-types.spec.js proves each type's operations work on its own single-type
// document. Nothing checks the intersection: that a mind map or flowchart living on
// the unified canvas still supports those operations — which is precisely where
// "merging the four types onto one canvas broke previously-working functionality"
// hides.
//
// So these mirror the legacy mind-map and flowchart tests, operation for operation,
// against a UNIFIED document. A failure here means the feature works standalone and
// is broken on the canvas every new diagram now uses.
//
// These objects are edited IN PLACE (#45). An earlier design made them read-only
// frames that you double-clicked into a focus mode; that mode swapped the editor to
// the sub-model's single-type view at its own coordinates, so it had to refit the
// camera on entry and exit — the jump this replaced. There is no breadcrumb to wait
// for and no camera move to settle: a node is simply clicked where it sits.
//
// Assertions go through the PERSISTED document, as everywhere else in this suite.
// Rendering something that never saves is this app's characteristic failure.

test.describe('unified canvas: mind-map operations in place', () => {
  test('Tab adds a child node, as it does on a standalone mind map', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })

    await clickNode(page, 'Branch A')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')

    await expect
      .poll(async () => (await diagram.saved(name)).mindmap.nodes.length, {
        message: 'Tab on a unified-canvas mind map did not add a child node',
        timeout: 20_000,
      })
      .toBe(5)
  })

  test('arrow-key navigation moves the selection to the next node', async ({ page, diagram }) => {
    // Deliberately NOT "the toolbar is still visible" — that assertion passes when
    // the arrow key does nothing at all, which is exactly the bug this file found.
    // Navigate, then add a child: the new node's parent proves where the selection
    // actually landed, and it is checked against the persisted document.
    const name = await diagram.open('unified', { framesInView: true })

    await clickNode(page, 'Branch A')
    await expect(page.locator(MM_TOOLBAR)).toBeVisible()
    await page.keyboard.press('ArrowDown') // Branch A (order 0) -> Branch B (order 1)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')

    await expect
      .poll(async () => {
        const nodes = (await diagram.saved(name)).mindmap.nodes
        const added = nodes.find((n) => !['m1', 'm2', 'm3', 'm4'].includes(n.id))
        return added?.parentId
      }, {
        message: 'arrow nav did not move the selection from Branch A to Branch B',
        timeout: 20_000,
      })
      .toBe('m3')
  })

  test('deleting a leaf node persists', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })

    await clickNode(page, 'Branch C') // a leaf
    await page.keyboard.press('Delete')

    await expect
      .poll(async () => (await diagram.saved(name)).mindmap.nodes.length, {
        message: 'deleting a node on a unified-canvas mind map did not persist',
        timeout: 20_000,
      })
      .toBe(3)
  })

  // The regression #45 exists for. Selecting a node used to enter a focus mode that
  // re-framed the whole canvas, so the content jumped out from under the cursor. In
  // place means the camera does not move at all — asserted on a NEIGHBOURING node, so
  // a layout shift caused by the selected node's own outline can't mask a real jump.
  test('selecting a node does not move the camera', async ({ page, diagram }) => {
    await diagram.open('unified', { framesInView: true })
    const neighbour = mindmapNode(page, 'Branch B')
    const before = await boxInWindow(page, neighbour, 'mind-map node "Branch B"')

    await clickNode(page, 'Branch A')
    await expect(page.locator(MM_TOOLBAR)).toBeVisible()

    const after = await boxInWindow(page, neighbour, 'mind-map node "Branch B"')
    expect(
      { x: Math.round(after.x), y: Math.round(after.y) },
      'selecting a node re-framed the canvas — the focus-mode camera jump is back',
    ).toEqual({ x: Math.round(before.x), y: Math.round(before.y) })
  })
})

test.describe('unified canvas: flowchart operations in place', () => {
  // Regression guard for a register/unregister race in the interaction registry: two
  // components held the layer key 'flowchart' across a mount/unmount overlap and the
  // outgoing unmount hook deleted the entry the incoming one had just registered. The
  // registry ended up empty, delegatesSurface() went false, and every surface event
  // fell through to the block handling. The node did not move at all, not even on
  // screen, so it read as "these are render-only" rather than a dead seam.
  test('a node can be moved and the move persists', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })
    const before = (await diagram.saved(name)).flowchart.nodes.find((n) => n.id === 'f2')

    await dragNode(page, flowchartNode(page, 'Do work'), 'flowchart node "Do work"', 160, 60)

    await expect
      .poll(async () => {
        const n = (await diagram.saved(name)).flowchart.nodes.find((x) => x.id === 'f2')
        return n.x !== before.x || n.y !== before.y
      }, {
        message: 'dragging a flowchart node on the unified canvas did not persist',
        timeout: 20_000,
      })
      .toBe(true)
  })

  test('the seeded edges render', async ({ page, diagram }) => {
    await diagram.open('unified', { framesInView: true })
    for (const label of ['Start', 'Do work', 'OK?']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
    const routes = await page.locator(`${SURFACE} path[stroke]:not([stroke="none"])`).count()
    expect(routes, 'flowchart edges did not render on the unified canvas').toBeGreaterThanOrEqual(2)
  })
})

test.describe('unified canvas: objects alongside the rest of the canvas', () => {
  test('an in-place editing session raises no uncaught errors', async ({ page, diagram }) => {
    const errors = watchForErrors(page)
    await diagram.open('unified', { framesInView: true })

    await clickNode(page, 'Branch A')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')
    await dragNode(page, flowchartNode(page, 'Do work'), 'flowchart node "Do work"', 40, 30)

    await expect(page.locator(SURFACE).first()).toBeVisible()
    expect(errors.pageErrors, 'in-place editing raised uncaught exceptions').toEqual([])
    expect(errors.failures, 'in-place editing made requests that failed').toEqual([])
  })
})
