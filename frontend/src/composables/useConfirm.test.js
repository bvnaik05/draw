import { describe, it, expect, vi, beforeEach } from 'vitest'
import { confirm, useConfirmState, runConfirm, closeConfirm } from './useConfirm.js'

const state = useConfirmState()

describe('useConfirm', () => {
  beforeEach(() => closeConfirm())

  it('opens with the question it was given', () => {
    confirm({ title: 'Delete permanently?', message: 'This cannot be undone.', theme: 'red' })
    expect(state.open).toBe(true)
    expect(state.request.title).toBe('Delete permanently?')
    expect(state.error).toBe('')
  })

  it('runs the action and closes when it resolves', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    confirm({ title: 'Sure?', onConfirm })

    await runConfirm()

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(state.open).toBe(false)
  })

  // The dialog is the only place the user can retry, so a failure has to keep it
  // open — closing on error would swallow the reason with it.
  it('stays open and shows the reason when the action fails', async () => {
    confirm({ title: 'Sure?', onConfirm: () => Promise.reject({ messages: ['Not permitted'] }) })

    await runConfirm()

    expect(state.open).toBe(true)
    expect(state.error).toBe('Not permitted')
    expect(state.loading).toBe(false)
  })

  it('never renders "undefined" for a reject value it cannot read', async () => {
    confirm({ title: 'Sure?', onConfirm: () => Promise.reject(null) })
    await runConfirm()
    expect(state.error).toBe('Something went wrong')
  })

  it('ignores a second confirm click while the first is still running', async () => {
    let release
    const onConfirm = vi.fn(() => new Promise((resolve) => (release = resolve)))
    confirm({ title: 'Sure?', onConfirm })

    const first = runConfirm()
    await runConfirm()
    expect(onConfirm).toHaveBeenCalledTimes(1)

    release()
    await first
    expect(state.open).toBe(false)
  })

  it('clears the error when the same dialog is opened again', async () => {
    confirm({ title: 'Sure?', onConfirm: () => Promise.reject('nope') })
    await runConfirm()
    expect(state.error).toBe('nope')

    confirm({ title: 'Sure?' })
    expect(state.error).toBe('')
  })

  it('closes without running anything on cancel', () => {
    const onConfirm = vi.fn()
    confirm({ title: 'Sure?', onConfirm })

    closeConfirm()

    expect(onConfirm).not.toHaveBeenCalled()
    expect(state.open).toBe(false)
  })

  it('tolerates a confirm with no action at all', async () => {
    confirm({ title: 'Just so you know' })
    await runConfirm()
    expect(state.open).toBe(false)
  })
})
