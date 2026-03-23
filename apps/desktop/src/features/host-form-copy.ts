/** UI strings for {@link HostForm}; verbose = full help, compact = sidebar slide. */
export type HostFormCopy = {
  connectionLead: string;
  accessLead: string;
  proxyLead: string;
  aliasHelp: string;
  hostNameHelp: string;
  portHelp: string;
  storeUserHelp: string;
  identityHelp: string;
  jumpShortcutHelp: string;
  proxyCommandPresetHelp: string;
};

export const HOST_FORM_COPY_VERBOSE: HostFormCopy = {
  connectionLead: "SSH host alias, target address, and port.",
  accessLead: "Link a store user and identity, or enter a custom SSH user and key path.",
  proxyLead: "Jump through another saved host, or enter a custom ProxyJump value.",
  aliasHelp: "Friendly name used in your SSH host list.",
  hostNameHelp: "IP or DNS hostname of the target machine.",
  portHelp: "TCP port for SSH (default 22).",
  storeUserHelp:
    "When set, the store user’s login name is used for SSH (and can supply defaults elsewhere).",
  identityHelp:
    "Keys from the identity store. Unlock encrypted keys under App Settings → Identity Store → SSH keys. Unmatched config paths show as “Other path”.",
  jumpShortcutHelp:
    "Lists hosts marked as jump hosts when at least one exists; otherwise all saved aliases. You can always type any ProxyJump string below.",
  proxyCommandPresetHelp: "Common patterns; replace placeholders like bastion or proxy address.",
};

export const HOST_FORM_COPY_COMPACT: HostFormCopy = {
  connectionLead: "Alias, address, port.",
  accessLead: "Store user / identity or custom user + key path.",
  proxyLead: "Jump host shortcut or custom ProxyJump / ProxyCommand.",
  aliasHelp: "List name (~/.ssh/config Host).",
  hostNameHelp: "Real address SSH connects to.",
  portHelp: "SSH port (default 22).",
  storeUserHelp: "Uses store user’s login for SSH.",
  identityHelp: "Store keys; unlock under Settings → Identity Store → SSH keys.",
  jumpShortcutHelp: "Jump-tagged hosts only when any exist; else all aliases.",
  proxyCommandPresetHelp: "Pick a pattern; edit command if needed.",
};

export type HostMetadataFieldsCopy = {
  hostKeyLabel: string;
  hostKeyHelp: string;
  tagsLabel: string;
  tagsPlaceholder: string;
  jumpHostLabel: string;
  jumpHostHelp: string;
  favoriteLabel: string;
};

export const HOST_METADATA_FIELDS_COPY_VERBOSE: HostMetadataFieldsCopy = {
  hostKeyLabel: "Host key verification (SSH)",
  hostKeyHelp:
    "Applies to this host when connecting in the terminal (including ProxyJump hops). Use auto-accept when you cannot answer hidden yes/no prompts.",
  tagsLabel: "Tags (comma separated)",
  tagsPlaceholder: "prod, home, lab",
  jumpHostLabel: "Jump host (bastion)",
  jumpHostHelp:
    "Offered in the ProxyJump shortcut list for other hosts. Adds the reserved tag “jumphost” to this host.",
  favoriteLabel: "Favorite",
};

export const HOST_METADATA_FIELDS_COPY_COMPACT: HostMetadataFieldsCopy = {
  hostKeyLabel: "Host key (SSH)",
  hostKeyHelp: "Terminal connections; use auto-accept if prompts are hidden behind jumps.",
  tagsLabel: "Tags",
  tagsPlaceholder: "comma separated",
  jumpHostLabel: "Jump host",
  jumpHostHelp: "Shortcut list + tag jumphost.",
  favoriteLabel: "Favorite",
};
