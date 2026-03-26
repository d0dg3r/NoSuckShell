/** JSON stored in Rust until the new window loads; same auth path as in-pane consoles (PROXMUX API). */
export type ProxmoxStandalonePayload =
  | { kind: "qemu-vnc"; clusterId: string; node: string; vmid: string; paneTitle: string }
  | { kind: "lxc-term"; clusterId: string; node: string; vmid: string; paneTitle: string }
  | { kind: "node-term"; clusterId: string; node: string; paneTitle: string };
