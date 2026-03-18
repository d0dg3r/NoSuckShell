export type HostConfig = {
  host: string;
  hostName: string;
  user: string;
  port: number;
  identityFile: string;
  proxyJump: string;
  proxyCommand: string;
};

export type HostMetadata = {
  favorite: boolean;
  tags: string[];
  lastUsedAt: number | null;
  trustHostDefault: boolean;
};

export type HostMetadataStore = {
  defaultUser: string;
  hosts: Record<string, HostMetadata>;
};

export type BackupPayload = {
  sshConfig: string;
  metadata: HostMetadataStore;
  exportedAt: number;
};

export type SessionOutputEvent = {
  session_id: string;
  chunk: string;
  host_key_prompt: boolean;
};

export type SessionStarted = {
  session_id: string;
};

export type PaneLayoutItem = {
  id: string;
  width: number;
  height: number;
};

export type LayoutPaneSnapshot = {
  width: number;
  height: number;
  hostAlias: string | null;
};

export type LayoutSplitTreeNode =
  | {
      id: string;
      type: "leaf";
      paneIndex: number;
    }
  | {
      id: string;
      type: "split";
      axis: "horizontal" | "vertical";
      ratio: number;
      first: LayoutSplitTreeNode;
      second: LayoutSplitTreeNode;
    };

export type LayoutProfile = {
  id: string;
  name: string;
  withHosts: boolean;
  panes: LayoutPaneSnapshot[];
  splitTree?: LayoutSplitTreeNode | null;
  createdAt: number;
  updatedAt: number;
};
