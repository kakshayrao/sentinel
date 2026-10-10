export { cn } from "cn"

/** Props for a table row that opens something: clickable, focusable, and activated with Enter or Space. */
export function clickableRow(onActivate: () => void) {
  return {
    tabIndex: 0,
    className: "cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none",
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return // keys inside menus/buttons in the row
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onActivate()
      }
    },
  }
}
