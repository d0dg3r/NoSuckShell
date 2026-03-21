/**
 * Stub IPC for `e2e` / screenshot builds (replaces `@tauri-apps/api/core` invoke).
 */
import type {
  EntityStore,
  GroupObject,
  HostConfig,
  HostMetadataStore,
  LayoutProfile,
  QuickSshSessionRequest,
  SessionStarted,
  TagObject,
  UserObject,
  ViewFilterGroup,
  ViewProfile,
} from "../types";
import { emitTauriEvent } from "./tauri-event-shim";

const now = () => Math.floor(Date.now() / 1000);

const seedHosts: HostConfig[] = [
  {
    host: "demo-server",
    hostName: "staging.example.com",
    user: "demo",
    port: 22,
    identityFile: "",
    proxyJump: "",
    proxyCommand: "",
  },
  {
    host: "lab-runner",
    hostName: "lab.example.com",
    user: "builder",
    port: 22,
    identityFile: "",
    proxyJump: "",
    proxyCommand: "",
  },
];

/** Mutable host list for e2e (save_host / delete_host update this; list_hosts reads it). */
let e2eHosts: HostConfig[] = [...seedHosts];

const demoMetadata: HostMetadataStore = {
  defaultUser: "",
  hosts: {
    "demo-server": {
      favorite: true,
      tags: ["demo", "staging"],
      lastUsedAt: now(),
      trustHostDefault: true,
    },
    "lab-runner": {
      favorite: false,
      tags: ["ci"],
      lastUsedAt: now() - 3600,
      trustHostDefault: true,
    },
  },
};

const demoLayoutProfiles: LayoutProfile[] = [
  {
    id: "profile-demo-1",
    name: "Two-pane staging",
    withHosts: true,
    panes: [],
    splitTree: null,
    createdAt: now() - 86400,
    updatedAt: now(),
  },
];

const emptyViewFilterGroup: ViewFilterGroup = {
  id: "root",
  mode: "and",
  rules: [],
  groups: [],
};

const demoViewProfiles: ViewProfile[] = [
  {
    id: "view-demo-1",
    name: "Staging only",
    order: 0,
    filterGroup: {
      ...emptyViewFilterGroup,
      rules: [{ id: "r1", field: "tag", operator: "contains", value: "staging" }],
    },
    sortRules: [{ field: "host" as const, direction: "asc" as const }],
    createdAt: now() - 3600,
    updatedAt: now(),
  },
];

const defaultEntityStore = (): EntityStore => ({
  schemaVersion: 1,
  updatedAt: now(),
  users: {},
  groups: {},
  tags: {},
  keys: {},
  hostBindings: {},
});

let sessionSeq = 0;

function nextSessionId(prefix: string): string {
  sessionSeq += 1;
  return `${prefix}-${sessionSeq}`;
}

function emitShellBanner(sessionId: string, lines: string): void {
  // Defer past React mount + `listen()` subscription in TerminalPane.
  window.setTimeout(() => {
    emitTauriEvent("session-output", {
      session_id: sessionId,
      chunk: lines,
      host_key_prompt: false,
    });
  }, 1200);
}

export async function invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  switch (cmd) {
    case "list_hosts":
      return e2eHosts;
    case "list_host_metadata":
      return demoMetadata;
    case "list_layout_profiles":
      return demoLayoutProfiles;
    case "list_view_profiles":
      return demoViewProfiles;
    case "list_store_objects":
      return defaultEntityStore();
    case "save_host": {
      const host = args?.host as HostConfig | undefined;
      if (host?.host) {
        const idx = e2eHosts.findIndex((h) => h.host === host.host);
        if (idx >= 0) {
          e2eHosts = e2eHosts.map((h, i) => (i === idx ? host : h));
        } else {
          e2eHosts = [...e2eHosts, host];
        }
      }
      return undefined;
    }
    case "delete_host": {
      const hostName = args?.hostName as string | undefined;
      if (hostName) {
        e2eHosts = e2eHosts.filter((h) => h.host !== hostName);
      }
      return undefined;
    }
    case "save_host_metadata":
    case "touch_host_last_used":
    case "export_backup":
    case "import_backup":
    case "save_layout_profile":
    case "delete_layout_profile":
    case "save_view_profile":
    case "delete_view_profile":
    case "reorder_view_profiles":
    case "save_store_objects":
    case "assign_host_binding":
    case "create_encrypted_key":
    case "unlock_key_material":
    case "delete_key":
    case "send_input":
    case "resize_session":
    case "close_session":
      return undefined;
    case "start_local_session": {
      const session_id = nextSessionId("local");
      emitShellBanner(session_id, "\r\nNoSuckShell local demo shell\r\n$ ");
      return { session_id } satisfies SessionStarted;
    }
    case "start_session": {
      const host = args?.host as HostConfig;
      const session_id = nextSessionId("ssh");
      const alias = host?.host ?? "host";
      const hn = host?.hostName ?? "example.com";
      const u = host?.user ?? "user";
      emitShellBanner(
        session_id,
        `\r\ne2e mock shell\r\nConnected to ${alias} (${hn})\r\nLast login: Mon Jan  1 12:00:00 2024 from 203.0.113.10\r\n${u}@${hn.split(".")[0]}:~$ `,
      );
      return { session_id } satisfies SessionStarted;
    }
    case "start_quick_ssh_session": {
      const request = args?.request as QuickSshSessionRequest;
      const session_id = nextSessionId("quick");
      const hn = request?.hostName ?? "example.com";
      const u = request?.user ?? "user";
      emitShellBanner(session_id, `\r\nQuick SSH session → ${u}@${hn}\r\n$ `);
      return { session_id } satisfies SessionStarted;
    }
    case "list_users":
      return [] as UserObject[];
    case "list_groups":
      return [] as GroupObject[];
    case "list_tags":
      return [] as TagObject[];
    default:
      throw new Error(`e2e invoke not implemented: ${cmd}`);
  }
}
