import { describe, expect, it } from "vitest";
import { parseFileDragPayload, serializeFileDragPayload, type FileDragPayload } from "./file-pane-dnd";

describe("file-pane-dnd", () => {
  it("round-trips local payload", () => {
    const p: FileDragPayload = { kind: "local", pathKey: "Documents", name: "a.txt" };
    expect(parseFileDragPayload(serializeFileDragPayload(p))).toEqual(p);
  });

  it("round-trips remote saved spec", () => {
    const p: FileDragPayload = {
      kind: "remote",
      parentPath: "/home/x",
      name: "b.bin",
      spec: {
        kind: "saved",
        host: {
          host: "h1",
          hostName: "example.com",
          user: "u",
          port: 22,
          identityFile: "",
          proxyJump: "",
          proxyCommand: "",
        },
      },
    };
    expect(parseFileDragPayload(serializeFileDragPayload(p))).toEqual(p);
  });

  it("rejects invalid JSON", () => {
    expect(parseFileDragPayload("")).toBeNull();
    expect(parseFileDragPayload("{}")).toBeNull();
  });
});
