import { describe, it, expect, vi, beforeEach } from 'vitest'

const setTrashed = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/data/diagrams.js', () => ({ setTrashed: (...args) => setTrashed(...args) }))
vi.mock('frappe-ui', () => ({ toast }))

const { useOptimisticTrash } = await import('./useOptimisticTrash.js')

// A promise the test resolves by hand, so it can inspect the interface while the
// write is still in flight — which is the whole point of an optimistic action.
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// The Undo handler the toast was handed, so a test can click it.
function undoHandler() {
  return toast.success.mock.calls.at(-1)[1].action.onClick
}

describe('useOptimisticTrash', () => {
  beforeEach(() => {
    // By default the server accepts everything it was asked for.
    setTrashed.mockReset().mockImplementation((names) => Promise.resolve(names))
    toast.success.mockReset()
    toast.error.mockReset()
  })

  it('hides the rows before the write has been answered', async () => {
    const write = deferred()
    setTrashed.mockReturnValueOnce(write.promise)
    const { notTrashing, trashDiagrams } = useOptimisticTrash(async () => {})

    const settled = trashDiagrams(['a', 'b'])

    expect(notTrashing({ name: 'a' })).toBe(false)
    expect(notTrashing({ name: 'b' })).toBe(false)
    expect(notTrashing({ name: 'c' })).toBe(true)

    write.resolve(['a', 'b'])
    await settled
  })

  it('sends the whole batch as one request', async () => {
    const { trashDiagrams } = useOptimisticTrash(async () => {})
    await trashDiagrams(['a', 'b', 'c'])
    expect(setTrashed).toHaveBeenCalledTimes(1)
    expect(setTrashed).toHaveBeenCalledWith(['a', 'b', 'c'], true)
  })

  it('offers Undo on the toast the moment the rows go', async () => {
    const write = deferred()
    setTrashed.mockReturnValueOnce(write.promise)
    const { trashDiagrams } = useOptimisticTrash(async () => {})

    const settled = trashDiagrams(['a'])

    expect(toast.success).toHaveBeenCalledWith(
      'Moved 1 diagram to Trash',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    )
    write.resolve(['a'])
    await settled
  })

  it('keeps the rows hidden until the reloaded list agrees they are gone', async () => {
    const reload = deferred()
    const { notTrashing, trashDiagrams } = useOptimisticTrash(() => reload.promise)

    const settled = trashDiagrams(['a'])
    await Promise.resolve()
    await Promise.resolve()
    // The write has landed but the list has not reloaded — showing the row again
    // here would flash it back into a shelf it no longer belongs to.
    expect(notTrashing({ name: 'a' })).toBe(false)

    reload.resolve()
    await settled
    expect(notTrashing({ name: 'a' })).toBe(true)
  })

  it('puts the rows back and says so when the write fails', async () => {
    setTrashed.mockRejectedValueOnce({ messages: ['Insufficient Permission'] })
    const refresh = vi.fn()
    const { notTrashing, trashDiagrams } = useOptimisticTrash(refresh)

    await expect(trashDiagrams(['a', 'b'])).resolves.toEqual([])

    expect(notTrashing({ name: 'a' })).toBe(true)
    expect(notTrashing({ name: 'b' })).toBe(true)
    expect(toast.error).toHaveBeenCalledWith('Insufficient Permission')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('restores the batch when Undo is taken', async () => {
    const { trashDiagrams } = useOptimisticTrash(async () => {})
    await trashDiagrams(['a', 'b'])

    await undoHandler()()

    expect(setTrashed).toHaveBeenLastCalledWith(['a', 'b'], false)
    expect(toast.success).toHaveBeenLastCalledWith('Restored 2 diagrams')
  })

  // A restore that overtook the trash write would be undone by the very write it
  // was undoing, leaving the diagrams in Trash with the toast claiming otherwise.
  it('holds Undo until the trash write has settled', async () => {
    const write = deferred()
    setTrashed.mockReturnValueOnce(write.promise)
    const { trashDiagrams } = useOptimisticTrash(async () => {})

    const settled = trashDiagrams(['a'])
    const undone = undoHandler()()

    expect(setTrashed).toHaveBeenCalledTimes(1)

    write.resolve(['a'])
    await settled
    await undone
    expect(setTrashed).toHaveBeenLastCalledWith(['a'], false)
  })

  it('does not offer Undo for a trash that failed', async () => {
    setTrashed.mockRejectedValueOnce(new Error('nope'))
    const { trashDiagrams } = useOptimisticTrash(async () => {})

    await trashDiagrams(['a'])
    await undoHandler()()

    // One call: the failed trash. Undo declined to restore what was never trashed.
    expect(setTrashed).toHaveBeenCalledTimes(1)
  })

  it('does nothing at all for an empty selection', async () => {
    const { trashDiagrams } = useOptimisticTrash(async () => {})
    await expect(trashDiagrams([])).resolves.toEqual([])
    expect(setTrashed).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })
})
