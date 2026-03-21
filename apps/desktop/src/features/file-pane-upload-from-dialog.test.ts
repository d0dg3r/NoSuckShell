import { describe, expect, it } from "vitest";
import { splitLocalPickPath } from "./file-pane-upload-from-dialog";

describe("splitLocalPickPath", () => {
  it("splits POSIX absolute file path", () => {
    expect(splitLocalPickPath("/home/user/docs/readme.txt")).toEqual({
      dir: "/home/user/docs",
      base: "readme.txt",
    });
  });

  it("splits file in filesystem root", () => {
    expect(splitLocalPickPath("/etc/hosts")).toEqual({ dir: "/etc", base: "hosts" });
  });

  it("normalizes backslashes before splitting", () => {
    expect(splitLocalPickPath(String.raw`C:\Users\me\file.txt`)).toEqual({
      dir: "C:/Users/me",
      base: "file.txt",
    });
  });

  it("treats path without slash as basename only", () => {
    expect(splitLocalPickPath("readme.txt")).toEqual({ dir: ".", base: "readme.txt" });
  });

  it("handles empty string", () => {
    expect(splitLocalPickPath("")).toEqual({ dir: "", base: "" });
  });

  it("trims whitespace", () => {
    expect(splitLocalPickPath("  /tmp/a  ")).toEqual({ dir: "/tmp", base: "a" });
  });
});
