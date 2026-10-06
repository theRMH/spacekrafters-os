import { useLayoutEffect, useState } from 'react'

// Tracks a trigger element's live screen position while a floating panel tied
// to it is open — used by SearchableSelect/DateField/TimeField, whose panels
// portal to document.body instead of rendering as a `position: absolute`
// child. A plain absolute panel nested inside a scrollable BottomSheet
// (`overflow-y-auto`) can end up clipped, or have other in-flow page content
// (e.g. a submit button) paint over it, regardless of z-index — portaling to
// body with a position computed from getBoundingClientRect() escapes that
// entirely. Closes on scroll instead of tracking it, same as a native
// control's popup.
export function useTriggerRect<T extends HTMLElement>(
  open: boolean,
  triggerRef: React.RefObject<T>,
  onScrollClose: () => void,
  // The panel's own ref, if it has internal scroll (e.g. SearchableSelect's
  // option list) — scroll events there must not count as "the page scrolled"
  // and close the panel out from under the user mid-scroll. The 'scroll'
  // event doesn't bubble, but a capture-phase window listener still sees it
  // for any scrollable descendant, so without this a window-level listener
  // can't otherwise tell "the BottomSheet behind this scrolled" apart from
  // "the dropdown's own list scrolled".
  panelRef?: React.RefObject<HTMLElement>,
): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useLayoutEffect(() => {
    if (!open) { setRect(null); return }
    function place() { setRect(triggerRef.current?.getBoundingClientRect() ?? null) }
    place()
    function onScroll(e: Event) {
      if (panelRef?.current?.contains(e.target as Node)) return
      onScrollClose()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return rect
}
