import { describe, expect, it } from "vitest";
import { buildPageReport, reportFileName, timeAgo } from "./report";
import type { PageReportInput } from "./report";

const input: PageReportInput = {
  url: "https://www.example.com/pricing",
  pageTitle: "Pricing",
  scannedAt: "2026-07-02T14:30:00.000Z",
  durationMs: 1234,
  score: 87,
  counts: { critical: 0, serious: 1, moderate: 2, minor: 3 },
  violations: [],
  needsReview: [],
  environment: null,
};

describe("buildPageReport", () => {
  it("stamps tool/format metadata and echoes the scan payload", () => {
    const report = buildPageReport(input);
    expect(report.tool).toBe("AllyProof");
    expect(report.format).toBe("allyproof-page-report");
    expect(report.formatVersion).toBe(1);
    expect(report.url).toBe(input.url);
    expect(report.score).toBe(87);
    expect(report.counts.serious).toBe(1);
  });
});

describe("reportFileName", () => {
  it("builds a host + timestamp name", () => {
    const name = reportFileName(input.url, input.scannedAt);
    expect(name).toMatch(/^allyproof-www-example-com-\d{8}-\d{4}\.json$/);
  });

  it("survives an unparseable URL", () => {
    expect(reportFileName("not a url", input.scannedAt)).toMatch(
      /^allyproof-page-\d{8}-\d{4}\.json$/
    );
  });

  it("survives an unparseable timestamp", () => {
    expect(reportFileName(input.url, "garbage")).toBe(
      "allyproof-www-example-com-unknown.json"
    );
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-07-02T12:00:00.000Z").getTime();

  it("says just now under 45s", () => {
    expect(timeAgo("2026-07-02T11:59:30.000Z", now)).toBe("just now");
  });

  it("reports minutes and hours", () => {
    expect(timeAgo("2026-07-02T11:45:00.000Z", now)).toBe("15 min ago");
    expect(timeAgo("2026-07-02T09:00:00.000Z", now)).toBe("3h ago");
  });

  it("reports days under a week, locale date beyond", () => {
    expect(timeAgo("2026-06-30T12:00:00.000Z", now)).toBe("2d ago");
    expect(timeAgo("2026-06-01T12:00:00.000Z", now)).not.toMatch(/ago$/);
  });

  it("returns empty string for invalid input", () => {
    expect(timeAgo("garbage", now)).toBe("");
  });
});
