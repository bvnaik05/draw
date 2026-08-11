// The partial-batch contract, kept apart from the main happy-path suite because
// it needs `setTrashed` to answer with a SHORTER list than it was given — the
// endpoint skips diagrams the caller cannot write instead of failing the batch.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const setTrashed = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/data/diagrams.js', () => ({ setTrashed: (...args) => setTrashed(...args) }))
vi.mock('frappe-ui', () => ({ toast }))

const { useOptimisticTrash } = await import('./useOptimisticTrash.js')

function undoHandler() {
  return toast.success.mock.calls.at(-1)[1].action.onClick
}

describe('useOptimisticTrash — a batch the server only partly accepts', () => {
  beforeEach(() => {
    setTrashed.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
  })

  it('puts the declined rows back and says why', async () => {
    setTrashed.mockResolvedValueOnce(['mine-1', 'mine-2'])
    const { notTrashing, trashDiagrams } = useOptimisticTrash(async () => {})

    const moved = await trashDiagrams(['mine-1', 'theirs-1', 'mine-2', 'theirs-2'])

    expect(moved).toEqual(['mine-1', 'mine-2'])
    expect(notTrashing({ name: 'theirs-1' })).toBe(true)
    expect(toast.error).toHaveBeenCalledWith(
      '2 diagrams stayed — you can only delete diagrams you can edit',
    )
  })

  // Restoring a diagram that was never trashed would un-trash something the user
  // had deliberately put in the bin on an earlier action.
  it('restores only what actually moved', async () => {
    setTrashed.mockResolvedValueOnce(['mine-1'])
    const { trashDiagrams } = useOptimisticTrash(async () => {})
    await trashDiagrams(['mine-1', 'theirs-1'])

    setTrashed.mockResolvedValueOnce(['mine-1'])
    await undoHandler()()

    expect(setTrashed).toHaveBeenLastCalledWith(['mine-1'], false)
    expect(toast.success).toHaveBeenLastCalledWith('Restored 1 diagram')
  })

  it('says nothing extra when the server took the whole batch', async () => {
    setTrashed.mockResolvedValueOnce(['a', 'b'])
    const { trashDiagrams } = useOptimisticTrash(async () => {})

    await trashDiagrams(['a', 'b'])

    expect(toast.error).not.toHaveBeenCalled()
  })

  // The server took them; only the reload failed. Hiding the rows forever on that
  // basis would be a worse lie than showing a list that is one refresh stale.
  it('does not strand rows hidden when the reload rejects', async () => {
    setTrashed.mockResolvedValueOnce(['a'])
    const { notTrashing, trashDiagrams } = useOptimisticTrash(() => Promise.reject(new Error('offline')))

    await expect(trashDiagrams(['a'])).resolves.toEqual(['a'])
    expect(notTrashing({ name: 'a' })).toBe(true)
  })

  it('offers no Undo when the server accepted nothing', async () => {
    setTrashed.mockResolvedValueOnce([])
    const { trashDiagrams } = useOptimisticTrash(async () => {})
    await trashDiagrams(['theirs-1'])

    await undoHandler()()

    expect(setTrashed).toHaveBeenCalledTimes(1)
  })
})
