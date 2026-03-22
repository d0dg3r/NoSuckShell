/** Mirrors Rust `validate_external_http_url` in `main.rs` for safe iframe / open targets. */
export function validateExternalHttpUrl(url: string): string | null {
  const t = url.trim();
  if (!t) {
    return "URL is empty";
  }
  if (t.length > 8192) {
    return "URL is too long";
  }
  const lower = t.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return null;
  }
  return "URL must start with http:// or https://";
}
