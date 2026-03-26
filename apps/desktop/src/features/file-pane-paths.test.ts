import { describe, expect, it } from "vitest";
import {
  isLocalUpDisabled,
  joinLocalPath,
  localParentDir,
  localParentOfHome,
  localPathBreadcrumbSegments,
  localPathResolvedForTitle,
  remotePathBarFullDisplay,
  remotePathBreadcrumbSegments,
  remoteSshConnectionPrefix,
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

  it("localPathBreadcrumbSegments for home-relative and absolute", () => {
    expect(localPathBreadcrumbSegments("")).toEqual([{ label: "~", path: "" }]);
    expect(localPathBreadcrumbSegments("a/b")).toEqual([
      { label: "~", path: "" },
      { label: "a", path: "a" },
      { label: "b", path: "a/b" },
    ]);
    expect(localPathBreadcrumbSegments("/var/log")).toEqual([
      { label: "/", path: "/" },
      { label: "var", path: "/var" },
      { label: "log", path: "/var/log" },
    ]);
  });
});

describe("file-pane-paths remote", () => {
  const saved = {
    kind: "saved" as const,
    host: {
      host: "srv-alias",
      hostName: "server.example",
      user: "root",
      port: 22,
      identityFile: "",
      proxyJump: "",
      proxyCommand: "",
    },
  };

  const quick = {
    kind: "quick" as const,
    request: {
      hostName: "10.0.0.4",
      user: "joe",
      identityFile: "",
      proxyJump: "",
      proxyCommand: "",
    },
  };

  it("remoteSshConnectionPrefix", () => {
    expect(remoteSshConnectionPrefix(saved)).toBe("root@server.example");
    expect(remoteSshConnectionPrefix(quick)).toBe("joe@10.0.0.4");
  });

  it("remotePathBarFullDisplay", () => {
    expect(remotePathBarFullDisplay(saved, "/var/log")).toBe("root@server.example:/var/log");
    expect(remotePathBarFullDisplay(quick, ".")).toBe("joe@10.0.0.4:.");
  });

  it("remotePathBreadcrumbSegments for ., /, and nested", () => {
    expect(remotePathBreadcrumbSegments(".")).toEqual([{ label: ".", path: "." }]);
    expect(remotePathBreadcrumbSegments("/")).toEqual([{ label: "/", path: "/" }]);
    expect(remotePathBreadcrumbSegments("/a/b")).toEqual([
      { label: "/", path: "/" },
      { label: "a", path: "/a" },
      { label: "b", path: "/a/b" },
    ]);
  });
});
