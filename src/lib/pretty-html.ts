/**
 * Tiny HTML pretty-printer used to break long opening tags onto
 * multiple lines so the AI fix drawer doesn't need horizontal
 * scroll. Conservative — only re-formats tags whose flat form
 * exceeds maxWidth; everything else passes through unchanged.
 *
 * Intentionally not a full HTML parser. The AI fixes are typically
 * flat snippets (one or two tags) so a regex pass is good enough
 * and avoids pulling in a heavy dependency.
 */

const TAG_RE =
  /<(\w[\w-]*)((?:\s+[\w:-]+(?:=(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)+)\s*(\/?)>/g;

const ATTR_RE =
  /\s+([\w:-]+)(?:=("[^"]*"|'[^']*'|[^\s"'>]+))?/g;

export function prettyHtml(input: string, maxWidth = 60): string {
  return input.replace(TAG_RE, (match, name: string, attrs: string, selfClose: string) => {
    if (match.length <= maxWidth) return match;
    const parts: string[] = [];
    let m: RegExpExecArray | null;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(attrs)) !== null) {
      parts.push(m[2] !== undefined ? `${m[1]}=${m[2]}` : m[1]!);
    }
    if (parts.length === 0) return match;
    const indent = "  ";
    const tail = selfClose ? "\n/>" : "\n>";
    return `<${name}\n${indent}${parts.join(`\n${indent}`)}${tail}`;
  });
}
