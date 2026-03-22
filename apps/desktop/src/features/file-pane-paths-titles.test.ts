import { describe, expect, it } from "vitest";
import { localFolderTitleShort, remoteFolderTitleShort, remotePathFullDisplay } from "./file-pane-paths";

describe("file pane title helpers", () => {
  it("localFolderTitleShort", () => {
    expect(localFolderTitleShort("")).toBe("Home");
    expect(localFolderTitleShort("/")).toBe("/");
    expect(localFolderTitleShort("Documents/work")).toBe("work");
    expect(localFolderTitleShort("/home/user/Downloads")).toBe("Downloads");
  });

  it("remoteFolderTitleShort", () => {
    expect(remoteFolderTitleShort(".")).toBe("Remote");
    expect(remoteFolderTitleShort("/")).toBe("/");
    expect(remoteFolderTitleShort("/var/log")).toBe("log");
  });

  it("remotePathFullDisplay", () => {
    expect(remotePathFullDisplay(".")).toBe(".");
    expect(remotePathFullDisplay("/a/b")).toBe("/a/b");
  });
});
