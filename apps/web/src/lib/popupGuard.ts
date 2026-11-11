/**
 * Recovery for wallet windows the browser blocked.
 *
 * Web wallets (Meteor, MyNearWallet, …) open their approval page with
 * `window.open`, which browsers only allow shortly after a click. When the
 * call is blocked, the connector gets a stand-in window instead of `null` and
 * the app asks for one click to open the real page; messages and close
 * detection then flow to the real window as if it had opened normally.
 */

export interface BlockedPopup {
  /** Open the wallet page; must run inside a click handler. */
  open(): void
  /** Give up; the wallet sees its window as closed and rejects the request. */
  cancel(): void
}

type Listener = (popup: BlockedPopup | null) => void

let listener: Listener | null = null
let installed = false

/** Receive blocked-popup prompts (null clears the prompt). */
export function onBlockedPopup(fn: Listener | null): void {
  listener = fn
}

export function installPopupGuard(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  const nativeOpen = window.open.bind(window)

  window.open = (url?: string | URL, target?: string, features?: string): WindowProxy | null => {
    const opened = nativeOpen(url, target, features)
    if (opened || !listener || url === undefined) return opened

    let real: WindowProxy | null = null
    let cancelled = false
    const queued: Array<[unknown, string]> = []

    const standIn = {
      get closed(): boolean {
        return cancelled || (real?.closed ?? false)
      },
      focus(): void {
        real?.focus()
      },
      close(): void {
        cancelled = true
        real?.close()
        listener?.(null)
      },
      postMessage(message: unknown, targetOrigin: string): void {
        if (real) real.postMessage(message, targetOrigin)
        else queued.push([message, targetOrigin])
      },
    }

    listener({
      open() {
        real = nativeOpen(url, target, features)
        if (!real) return
        listener?.(null)
        for (const [message, targetOrigin] of queued.splice(0)) real.postMessage(message, targetOrigin)
      },
      cancel() {
        cancelled = true
        listener?.(null)
      },
    })
    return standIn as unknown as WindowProxy
  }
}
