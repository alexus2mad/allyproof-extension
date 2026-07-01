import { describe, expect, it } from "vitest";
import {
  SHADOW_SEPARATOR,
  flattenTarget,
  flattenTargetEntry,
  splitSelectorChain,
} from "./target";

describe("flattenTargetEntry", () => {
  it("passes plain selectors through", () => {
    expect(flattenTargetEntry("main > .card")).toBe("main > .card");
  });

  it("joins shadow chains with the separator", () => {
    expect(flattenTargetEntry(["my-widget", "#inner"])).toBe(
      `my-widget${SHADOW_SEPARATOR}#inner`
    );
  });
});

describe("flattenTarget / splitSelectorChain round-trip", () => {
  it("round-trips a mixed target array", () => {
    const flattened = flattenTarget(["#top", ["x-host", "button.go"]]);
    expect(flattened).toEqual(["#top", `x-host${SHADOW_SEPARATOR}button.go`]);
    expect(splitSelectorChain(flattened[1]!)).toEqual(["x-host", "button.go"]);
  });

  it("splitting a plain selector yields a single hop", () => {
    expect(splitSelectorChain("nav a[href='/']")).toEqual(["nav a[href='/']"]);
  });

  it("does not split on child combinators that resemble the separator", () => {
    // " > " and ">>" must survive — only the exact " >>> " token splits.
    expect(splitSelectorChain("div > span")).toEqual(["div > span"]);
  });
});
