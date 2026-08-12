import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Browser-free source check (same shape as ShareMenu.test.js / overflowMenu.test.js).
// #396: the rename box drew the browser's default blue focus ring because it was a
// hand-rolled <input> and so missed the focus:ring-0 frappe-ui's TextInput applies.
// Both halves are pinned here: the components, and the ref indirection they force.
const here = path.dirname(fileURLToPath(import.meta.url))
const titleEditor = readFileSync(path.join(here, 'TitleEditor.vue'), 'utf8')

describe('TitleEditor is frappe-ui chrome (#396)', () => {
  it('renames through TextInput, not a raw input', () => {
    expect(titleEditor).toContain("from 'frappe-ui'")
    expect(titleEditor).toContain('<TextInput')
    expect(titleEditor).not.toMatch(/<input\b/)
  })

  it('shows the title through Button, not a raw button', () => {
    expect(titleEditor).toContain('<Button')
    expect(titleEditor).not.toMatch(/<button\b/)
  })

  it('focuses the field through the component the ref now points at', () => {
    // TextInput exposes { el }; ref.focus() would silently do nothing, leaving
    // the box editable-looking but unfocused and unselected.
    expect(titleEditor).toContain('input.value?.el?.focus()')
    expect(titleEditor).toContain('input.value?.el?.select()')
  })

  it('still commits on Enter and blur, and cancels on Escape', () => {
    expect(titleEditor).toContain('@blur="commit"')
    expect(titleEditor).toContain('@keyup.enter="commit"')
    expect(titleEditor).toContain('@keyup.esc="cancel"')
  })
})
