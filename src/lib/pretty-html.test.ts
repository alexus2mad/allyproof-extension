import { describe, expect, it } from "vitest";
import { prettyHtml } from "./pretty-html";

describe("prettyHtml", () => {
  it("leaves short tags untouched", () => {
    expect(prettyHtml('<a href="/x">go</a>')).toBe('<a href="/x">go</a>');
  });

  it("breaks long opening tags one attribute per line", () => {
    const long =
      '<button class="btn btn-primary btn-lg rounded-full" aria-label="Subscribe to the newsletter" data-tracking="cta-footer">Go</button>';
    const out = prettyHtml(long);
    expect(out).toContain("<button\n");
    expect(out).toContain('\n  aria-label="Subscribe to the newsletter"');
    expect(out.endsWith(">Go</button>")).toBe(true);
  });

  it("keeps self-closing syntax", () => {
    const long =
      '<img src="/very/long/path/to/an/image/file.png" alt="A description that pushes this tag well past sixty characters" />';
    const out = prettyHtml(long);
    expect(out).toContain("<img\n");
    expect(out.trimEnd().endsWith("/>")).toBe(true);
  });

  it("handles boolean attributes", () => {
    const long =
      '<input type="checkbox" checked disabled data-state="on" aria-describedby="a-very-long-description-id-here">';
    const out = prettyHtml(long);
    expect(out).toContain("\n  checked\n");
    expect(out).toContain("\n  disabled\n");
  });
});
