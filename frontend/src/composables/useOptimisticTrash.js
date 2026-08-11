// Moving diagrams to Trash from Home, the way a payment app confirms a transfer:
// commit the user's intent to the interface immediately, settle it in the
// background, and be honest if the settlement fails (GitHub #402).
//
// What it replaces: a confirm dialog whose onConfirm awaited one `set_value` per
// diagram. Clearing sixty of them meant sixty sequential requests and sixty-three
// seconds of a blocked modal, with nothing leaving the shelf until the very end.
//
// There is no confirm here. Trash is reversible, so an "are you sure" ahead of it
// buys nothing that Undo on the toast doesn't buy without blocking. Permanent
// delete (TrashView) still asks — that one cannot be taken back.

import { reactive } from 'vue'
import { toast } from 'frappe-ui'
import { setTrashed } from '@/data/diagrams.js'

// `refresh` reloads the caller's list and must resolve once it has; the hidden
// rows are held back until it does, so they never flash back in the gap.
export function useOptimisticTrash(refresh) {
  // Names hidden from the shelf while their trash write is in flight. A failed
  // write empties this and the rows reappear exactly where they were.
  const trashing = reactive(new Set())

  function notTrashing(diagram) {
    return !trashing.has(diagram.name)
  }

  function trashDiagrams(names) {
    if (!names.length) return Promise.resolve(false)
    names.forEach((name) => trashing.add(name))
    // The toast goes up against the in-flight write rather than after it, so Undo
    // is on offer from the moment the rows disappear.
    const settled = writeTrashed(names)
    toast.success(`Moved ${countLabel(names.length)} to Trash`, {
      action: { label: 'Undo', onClick: () => undoTrash(names, settled) },
    })
    return settled
  }

  // Resolves true once the batch is trashed and the list has caught up; false if
  // the write failed and the rows have been put back.
  async function writeTrashed(names) {
    try {
      await setTrashed(names, true)
    } catch (error) {
      names.forEach((name) => trashing.delete(name))
      toast.error(messageFrom(error, `Could not move ${countLabel(names.length)} to Trash`))
      return false
    }
    await refresh()
    names.forEach((name) => trashing.delete(name))
    return true
  }

  // Undo waits for the trash write to settle first: a restore that overtook it
  // would be undone by the very write it is undoing.
  async function undoTrash(names, settled) {
    if (!(await settled)) return
    try {
      await setTrashed(names, false)
    } catch (error) {
      toast.error(messageFrom(error, `Could not restore ${countLabel(names.length)}`))
      return
    }
    await refresh()
    toast.success(`Restored ${countLabel(names.length)}`)
  }

  return { notTrashing, trashDiagrams }
}

function countLabel(count) {
  return `${count} diagram${count === 1 ? '' : 's'}`
}

// Frappe parks the user-facing text in `messages`; fall back to our own wording
// rather than showing a bare stack-trace message.
function messageFrom(error, fallback) {
  return error?.messages?.[0] || fallback
}
