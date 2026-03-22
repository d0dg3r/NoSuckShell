import { describe, expect, it } from "vitest";
import { createDefaultHostMetadata } from "./app-bootstrap";
import { effectiveStrictHostKeyPolicy, metadataPatchForHostKeyPolicy } from "./host-metadata-policy";

describe("host-metadata-policy", () => {
  it("explicit ask ignores legacy trustHostDefault", () => {
    const m = { ...createDefaultHostMetadata(), trustHostDefault: true, strictHostKeyPolicy: "ask" as const };
    expect(effectiveStrictHostKeyPolicy(m)).toBe("ask");
  });

  it("migrates trustHostDefault to accept-new when policy unset", () => {
    const m = { ...createDefaultHostMetadata(), trustHostDefault: true };
    expect(effectiveStrictHostKeyPolicy(m)).toBe("accept-new");
  });

  it("metadataPatchForHostKeyPolicy sets trustHostDefault for non-ask", () => {
    expect(metadataPatchForHostKeyPolicy("ask")).toEqual({
      strictHostKeyPolicy: "ask",
      trustHostDefault: false,
    });
    expect(metadataPatchForHostKeyPolicy("accept-new").trustHostDefault).toBe(true);
    expect(metadataPatchForHostKeyPolicy("no").trustHostDefault).toBe(true);
  });
});
