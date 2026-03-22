/** Select value: user-edited ProxyCommand string not matching a known preset template. */
export const PROXY_COMMAND_PRESET_CUSTOM = "__proxy_custom";

export type ProxyCommandPreset = {
  id: string;
  label: string;
  /** Value written to `ProxyCommand` (user may edit placeholders). */
  value: string;
};

export const PROXY_COMMAND_PRESETS: ProxyCommandPreset[] = [
  {
    id: "ssh-w",
    label: "SSH -W via bastion",
    value: "ssh -W %h:%p bastion",
  },
  {
    id: "ssh-w-user",
    label: "SSH -W (user@bastion)",
    value: "ssh -W %h:%p user@bastion",
  },
  {
    id: "nc-socks",
    label: "SOCKS proxy (OpenBSD nc)",
    value: "nc -X 5 -x 127.0.0.1:1080 %h %p",
  },
];

export function proxyCommandPresetSelectValue(proxyCommand: string): string {
  const t = proxyCommand.trim();
  if (!t) {
    return PROXY_COMMAND_PRESET_CUSTOM;
  }
  const match = PROXY_COMMAND_PRESETS.find((p) => p.value === t);
  return match?.id ?? PROXY_COMMAND_PRESET_CUSTOM;
}

export function proxyCommandFromPresetSelect(value: string, currentProxyCommand: string): string {
  if (value === PROXY_COMMAND_PRESET_CUSTOM) {
    return currentProxyCommand.trim();
  }
  const preset = PROXY_COMMAND_PRESETS.find((p) => p.id === value);
  return preset?.value ?? currentProxyCommand.trim();
}
