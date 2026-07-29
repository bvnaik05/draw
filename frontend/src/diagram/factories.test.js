import { describe, it, expect } from 'vitest'
import { createShape } from './factories.js'
import { primaryTriad } from './theme.js'

// New shapes are outline-only (issue #31): a themed border so they are never raw
// black-on-white, but no fill, so drawing one never hides the content beneath it.
describe('createShape', () => {
  it('spawns with a transparent fill and the theme border', () => {
    const shape = createShape({ type: 'ellipse' }, 'slate')
    expect(shape.fill).toBe('none')
    expect(shape.border.color).toBe(primaryTriad('slate').stroke)
  })

  it('still honours an explicit fill from the caller (paste, duplicate)', () => {
    expect(createShape({ type: 'rectangle', fill: '#FFE9A8' }, 'slate').fill).toBe('#FFE9A8')
  })
})
