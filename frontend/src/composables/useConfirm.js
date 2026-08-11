// Draw's confirm dialog (#403).
//
// frappe-ui's `dialog.confirm()` paints an × in the corner of every confirm — a
// third way to say no, next to the Cancel button and the Esc key. On a two-button
// question it is noise, and on a destructive one it is worse than noise: the eye
// has to work out whether the × means "cancel" or "close this and delete anyway".
//
// The helper ties the × to dismissibility (`showCloseButton: dismissible`), so
// through that API the only way to drop it is `dismissible: false`, which takes Esc
// and outside-click with it. The underlying `Dialog` component keeps the two as
// separate props, so this renders it directly: no ×, Esc and outside-click intact.
//
// Same contract as the helper it replaces — resolving `onConfirm` closes the dialog,
// rejecting shows the error inline and re-enables the buttons to retry.

import { reactive } from 'vue'

// One confirm at a time. A confirm is a blocking question; a second stacked behind
// the first would leave no way to tell which question the buttons belong to.
const state = reactive({
  open: false,
  request: null,
  loading: false,
  error: '',
})

export function confirm(request) {
  Object.assign(state, { open: true, request, loading: false, error: '' })
}

// For ConfirmHost, the single mounted renderer. Not for call sites.
export function useConfirmState() {
  return state
}

export async function runConfirm() {
  if (state.loading) return
  state.loading = true
  state.error = ''
  try {
    await state.request?.onConfirm?.()
  } catch (error) {
    state.error = messageFrom(error)
    state.loading = false
    return
  }
  closeConfirm()
}

export function closeConfirm() {
  Object.assign(state, { open: false, loading: false, error: '' })
}

// Frappe parks the user-facing text in `messages`; fall back to `.message` and
// finally a generic line, so a bad reject value can never render "undefined".
function messageFrom(error) {
  if (typeof error === 'string') return error
  return error?.messages?.[0] || error?.message || 'Something went wrong'
}
