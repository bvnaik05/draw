// Moving diagrams to Trash from Home, the way a payment app confirms a transfer:
// commit the user's intent to the interface immediately, settle it in the
// background, and be honest if the settlement fails (GitHub #402).
//
// What it replaces: a confirm dialog whose onConfirm awaited one `set_value` per
// diagram. Clearing sixty of them meant sixty sequential requests and sixty-three
// seconds of a blocked modal, with nothing leaving the shelf until the very end.
//
// There is no confirm here: the bulk bar's Delete is a deliberate act on a
// selection the user just made, and Undo on the toast takes it back without
// blocking. The callers decide. A single diagram's ⋯ → Delete DOES ask (#449) —
// it sits one item below Duplicate, so a misclick is easy — and permanent delete
// (TrashView) always asks, since that one cannot be taken back.

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
    if (!names.length) return Promise.resolve([])
    names.forEach((name) => trashing.add(name))
    // The toast goes up against the in-flight write rather than after it, so Undo
    // is on offer from the moment the rows disappear. It claims the whole
    // selection because that is the optimistic promise; writeTrashed corrects the
    // record if the server turns any of them down.
    const settled = writeTrashed(names)
    toast.success(`Moved ${countLabel(names.length)} to Trash`, {
      action: { label: 'Undo', onClick: () => undoTrash(settled) },
    })
    return settled
  }

  // Resolves with the names the server ACTUALLY trashed — empty if the write
  // failed outright. The endpoint skips diagrams the caller cannot write rather
  // than failing the batch, so "we asked for 7" and "7 moved" are different
  // facts; reporting the first as the second would leave the user believing a
  // delete happened that did not, and would have Undo restore rows that were
  // never trashed.
  async function writeTrashed(names) {
    let updated = []
    try {
      updated = await setTrashed(names, true)
    } catch (error) {
      release(names)
      toast.error(messageFrom(error, `Could not move ${countLabel(names.length)} to Trash`))
      return []
    }
    // A failed reload leaves a stale list, which the release below resolves the
    // honest way — the rows come back rather than staying hidden on a guess.
    await refresh().catch(() => {})
    release(names)
    reportDeclined(names, updated)
    return updated
  }

  // Undo waits for the trash write to settle first: a restore that overtook it
  // would be undone by the very write it is undoing. It restores only what was
  // actually trashed.
  async function undoTrash(settled) {
    const trashed = await settled
    if (!trashed.length) return
    try {
      await setTrashed(trashed, false)
    } catch (error) {
      toast.error(messageFrom(error, `Could not restore ${countLabel(trashed.length)}`))
      return
    }
    await refresh().catch(() => {})
    toast.success(`Restored ${countLabel(trashed.length)}`)
  }

  function release(names) {
    names.forEach((name) => trashing.delete(name))
  }

  // Diagrams the server declined — shared with the caller at view level, say. The
  // rows are already back on the shelf by now; this says why they came back.
  function reportDeclined(names, updated) {
    const moved = new Set(updated)
    const declined = names.filter((name) => !moved.has(name))
    if (!declined.length) return
    toast.error(`${countLabel(declined.length)} stayed — you can only delete diagrams you can edit`)
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
