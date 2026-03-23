import { describe, expect, it } from "vitest";
import { validateExternalHttpUrl } from "./external-http-url";

describe("validateExternalHttpUrl", () => {
  it("accepts http and https", () => {
    expect(validateExternalHttpUrl("https://pve:8006/?console=kvm")).toBeNull();
    expect(validateExternalHttpUrl(" http://localhost/ ")).toBeNull();
  });

  it("rejects empty and non-http schemes", () => {
    expect(validateExternalHttpUrl("")).toBeTruthy();
    expect(validateExternalHttpUrl("   ")).toBeTruthy();
    expect(validateExternalHttpUrl("javascript:alert(1)")).toBeTruthy();
    expect(validateExternalHttpUrl("file:///etc/passwd")).toBeTruthy();
  });

  it("rejects oversized URLs", () => {
    expect(validateExternalHttpUrl(`https://x.com/${"a".repeat(8200)}`)).toBeTruthy();
  });
});
