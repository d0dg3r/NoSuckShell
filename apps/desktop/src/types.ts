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

export type ViewBuiltInId = "all" | "favorites";

export type ViewFilterField =
  | "host"
  | "hostName"
  | "user"
  | "port"
  | "status"
  | "favorite"
  | "recent"
  | "tag";

export type ViewFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "in";

export type ViewFilterRule = {
  id: string;
  field: ViewFilterField;
  operator: ViewFilterOperator;
  value: string;
};

export type ViewFilterGroup = {
  id: string;
  mode: "and" | "or";
  rules: ViewFilterRule[];
  groups: ViewFilterGroup[];
};

export type ViewSortField = "host" | "hostName" | "user" | "port" | "lastUsedAt" | "status" | "favorite";

export type ViewSortRule = {
  field: ViewSortField;
  direction: "asc" | "desc";
};

export type ViewProfile = {
  id: string;
  name: string;
  order: number;
  filterGroup: ViewFilterGroup;
  sortRules: ViewSortRule[];
  createdAt: number;
  updatedAt: number;
};
