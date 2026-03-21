type ParsedPort = {
  port?: number;
  error?: string;
};

const parsePort = (rawPort: string): ParsedPort => {
  const trimmed = rawPort.trim();
  if (!trimmed) {
    return {};
  }
  if (!/^\d+$/.test(trimmed)) {
    return { error: "Port must be an integer between 1 and 65535." };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return { error: "Port must be an integer between 1 and 65535." };
  }
  return { port: parsed };
};

export type ParsedHostPort = {
  hostName: string;
  port?: number;
  error?: string;
};

export const parseHostPortInput = (value: string): ParsedHostPort => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { hostName: "" };
  }
  const ipv6BracketMatch = trimmed.match(/^\[([^\]]+)\](?::(.+))?$/);
  if (ipv6BracketMatch) {
    const hostName = ipv6BracketMatch[1]?.trim() ?? "";
    if (!hostName) {
      return { hostName: "", error: "HostName is required for quick connect." };
    }
    const rawPort = ipv6BracketMatch[2];
    if (typeof rawPort === "undefined") {
      return { hostName };
    }
    const parsedPort = parsePort(rawPort);
    if (parsedPort.error) {
      return { hostName, error: parsedPort.error };
    }
    return { hostName, port: parsedPort.port };
  }
  const lastColonIndex = trimmed.lastIndexOf(":");
  if (lastColonIndex > 0 && trimmed.indexOf(":") === lastColonIndex) {
    const maybeHost = trimmed.slice(0, lastColonIndex).trim();
    const maybePort = trimmed.slice(lastColonIndex + 1);
    const parsedPort = parsePort(maybePort);
    if (parsedPort.error) {
      return { hostName: maybeHost, error: parsedPort.error };
    }
    if (typeof parsedPort.port !== "undefined" && maybeHost) {
      return { hostName: maybeHost, port: parsedPort.port };
    }
  }
  return { hostName: trimmed };
};

export type ParsedQuickConnectCommand = {
  user: string;
  hostName: string;
  port?: number;
  error?: string;
};

export const parseQuickConnectCommandInput = (value: string): ParsedQuickConnectCommand => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { user: "", hostName: "" };
  }
  const atIndex = trimmed.indexOf("@");
  const user = atIndex > 0 ? trimmed.slice(0, atIndex).trim() : "";
  const hostPart = atIndex > 0 ? trimmed.slice(atIndex + 1).trim() : trimmed;
  const parsed = parseHostPortInput(hostPart);
  return {
    user,
    hostName: parsed.hostName,
    port: parsed.port,
    error: parsed.error,
  };
};

export const buildQuickConnectUserCandidates = (defaultUser: string, storedUsers: string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(trimmed);
  };
  add(defaultUser);
  for (const entry of storedUsers) {
    add(entry);
  }
  return result;
};
