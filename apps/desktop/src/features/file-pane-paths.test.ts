import { describe, expect, it } from "vitest";
import {
  formatLocalPathDisplay,
  isLocalUpDisabled,
  joinLocalPath,
  localParentDir,
  localParentOfHome,
  localPathResolvedForTitle,
} from "./file-pane-paths";

describe("file-pane-paths local", () => {
  it("joinLocalPath handles home-relative and absolute parents", () => {
    expect(joinLocalPath("", "Documents")).toBe("Documents");
    expect(joinLocalPath("a", "b")).toBe("a/b");
    expect(joinLocalPath("/usr", "bin")).toBe("/usr/bin");
    expect(joinLocalPath("/", "tmp")).toBe("/tmp");
  });

  it("localParentDir handles relative and absolute keys", () => {
    expect(localParentDir("a/b")).toBe("a");
    expect(localParentDir("a")).toBe("");
    expect(localParentDir("")).toBe("");
    expect(localParentDir("/usr/local")).toBe("/usr");
    expect(localParentDir("/usr")).toBe("/");
    expect(localParentDir("/")).toBe("/");
  });

  it("localParentOfHome", () => {
    expect(localParentOfHome("/home/joe")).toBe("/home");
    expect(localParentOfHome("/")).toBe("/");
  });

  it("formatLocalPathDisplay maps home prefix to tilde", () => {
    expect(formatLocalPathDisplay("/home/joe", "")).toBe("~");
    expect(formatLocalPathDisplay("/home/joe", "Documents")).toBe("~/Documents");
    expect(formatLocalPathDisplay("/home/joe", "/home/joe")).toBe("~");
    expect(formatLocalPathDisplay("/home/joe", "/home/joe/proj")).toBe("~/proj");
    expect(formatLocalPathDisplay("/home/joe", "/etc")).toBe("/etc");
  });

  it("isLocalUpDisabled", () => {
    expect(isLocalUpDisabled("/", "/home/joe")).toBe(true);
    expect(isLocalUpDisabled("", "/home/joe")).toBe(false);
    expect(isLocalUpDisabled("", "/")).toBe(true);
    expect(isLocalUpDisabled("", null)).toBe(true);
    expect(isLocalUpDisabled("/home", "/home/joe")).toBe(false);
  });

  it("localPathResolvedForTitle", () => {
    expect(localPathResolvedForTitle("/home/joe", "")).toBe("/home/joe");
    expect(localPathResolvedForTitle("/home/joe", "x")).toBe("/home/joe/x");
    expect(localPathResolvedForTitle("/home/joe", "/etc")).toBe("/etc");
  });
});
