export const MAX_TERMINAL_SCROLLBACK_CHARS = 250_000;

/** Append-only scrollback with O(1) amortized trim instead of full-string concat per chunk. */
export class TerminalScrollbackBuffer {
  private parts: string[] = [];
  private totalLength = 0;

  append(chunk: string): void {
    if (chunk.length === 0) {
      return;
    }
    this.parts.push(chunk);
    this.totalLength += chunk.length;
    this.trimToMax();
  }

  toString(): string {
    return this.parts.join("");
  }

  private trimToMax(): void {
    while (this.totalLength > MAX_TERMINAL_SCROLLBACK_CHARS && this.parts.length > 0) {
      const first = this.parts[0];
      const overflow = this.totalLength - MAX_TERMINAL_SCROLLBACK_CHARS;
      if (first.length <= overflow) {
        this.parts.shift();
        this.totalLength -= first.length;
      } else {
        this.parts[0] = first.slice(overflow);
        this.totalLength -= overflow;
      }
    }
  }
}

const sessionScrollbackBuffers = new Map<string, TerminalScrollbackBuffer>();

export function appendSessionScrollback(sessionId: string, chunk: string): void {
  let buffer = sessionScrollbackBuffers.get(sessionId);
  if (!buffer) {
    buffer = new TerminalScrollbackBuffer();
    sessionScrollbackBuffers.set(sessionId, buffer);
  }
  buffer.append(chunk);
}

export function getSessionScrollback(sessionId: string): string {
  return sessionScrollbackBuffers.get(sessionId)?.toString() ?? "";
}

export function clearSessionScrollback(sessionId: string): void {
  sessionScrollbackBuffers.delete(sessionId);
}
