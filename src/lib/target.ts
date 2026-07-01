/**
 * axe-core node targets and how we flatten them.
 *
 * axe's `target` is `(string | string[])[]`: a plain string selects
 * in the light DOM; an inner ARRAY is a shadow-DOM chain — each hop
 * selects the next shadow host, the last selects inside the deepest
 * shadow root. The shared ProcessedNode type stores `string[]`, so
 * shadow chains are flattened into one string with a separator that
 * cannot occur inside a CSS selector, and split back apart when the
 * content script needs to walk the shadow roots to highlight.
 *
 * " >>> " mirrors the (defunct) shadow-piercing combinator so the
 * selector stays human-readable in exports and the dashboard.
 */

export const SHADOW_SEPARATOR = " >>> ";

/** Flatten one axe target entry (string or shadow chain) to a string. */
export function flattenTargetEntry(entry: string | readonly string[]): string {
  return Array.isArray(entry) ? entry.join(SHADOW_SEPARATOR) : (entry as string);
}

/** Flatten a whole axe target array into ProcessedNode.target shape. */
export function flattenTarget(
  target: ReadonlyArray<string | readonly string[]>
): string[] {
  return target.map(flattenTargetEntry);
}

/** Split a flattened selector back into its shadow-root hops. */
export function splitSelectorChain(selector: string): string[] {
  return selector.split(SHADOW_SEPARATOR);
}
