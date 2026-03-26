import { describe, expect, it } from "vitest";
import { monacoLanguageFromFileName } from "./file-pane-editor-language";

describe("monacoLanguageFromFileName", () => {
  it("maps common extensions", () => {
    expect(monacoLanguageFromFileName("README.md")).toBe("markdown");
    expect(monacoLanguageFromFileName("app.ts")).toBe("typescript");
    expect(monacoLanguageFromFileName("x.rs")).toBe("rust");
    expect(monacoLanguageFromFileName("data.json")).toBe("json");
  });

  it("defaults to plaintext", () => {
    expect(monacoLanguageFromFileName("Makefile")).toBe("plaintext");
    expect(monacoLanguageFromFileName("noext")).toBe("plaintext");
  });
});
