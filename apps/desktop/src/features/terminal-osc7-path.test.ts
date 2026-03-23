import { describe, expect, it } from "vitest";
import { parseOsc7WorkingDirectoryPayload, shortenPathForPaneTitle } from "./terminal-osc7-path";

describe("parseOsc7WorkingDirectoryPayload", () => {
  it("parses file URL with empty host", () => {
    expect(parseOsc7WorkingDirectoryPayload("file:///home/user/proj")).toBe("/home/user/proj");
  });

  it("parses file URL with hostname", () => {
    expect(parseOsc7WorkingDirectoryPayload("file://remotehost/var/log")).toBe("/var/log");
  });

  it("decodes percent-encoding in path", () => {
    expect(parseOsc7WorkingDirectoryPayload("file:///tmp/foo%20bar")).toBe("/tmp/foo bar");
  });

  it("returns null for non-file payload", () => {
    expect(parseOsc7WorkingDirectoryPayload("https://x/y")).toBeNull();
  });
});

describe("shortenPathForPaneTitle", () => {
  it("returns short paths unchanged", () => {
    expect(shortenPathForPaneTitle("/tmp", 44)).toBe("/tmp");
  });

  it("truncates long paths with middle ellipsis", () => {
    const long = "/very/long/path/that/exceeds/the/limit/sub/file";
    const out = shortenPathForPaneTitle(long, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out).toContain("…");
  });
});
