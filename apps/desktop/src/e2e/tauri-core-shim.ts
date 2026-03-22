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

/** Raw ~/.ssh/config stand-in for settings SSH tab in e2e builds. */
let e2eSshConfigRaw = `# e2e mock ssh config\nHost demo-server\n  HostName demo.local\n  User ssh-user\n`;

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
  schemaVersion: 3,
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
    case "get_ssh_config_raw":
      return e2eSshConfigRaw;
    case "save_ssh_config_raw": {
      e2eSshConfigRaw = typeof args?.content === "string" ? args.content : "";
      return undefined;
    }
    case "get_ssh_dir_info":
      return {
        defaultPath: "/home/e2e/.ssh",
        effectivePath: "/home/e2e/.ssh",
        overridePath: null,
        userProfile: null,
      };
    case "set_ssh_dir_override":
      return undefined;
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
    case "sftp_list_remote_dir":
      return [
        {
          name: "etc",
          isDir: true,
          size: 0,
          mtime: null,
          modeDisplay: "drwxr-xr-x",
          modeOctal: "755",
          userDisplay: "0",
          groupDisplay: "0",
        },
        {
          name: "home",
          isDir: true,
          size: 0,
          mtime: null,
          modeDisplay: "drwxr-xr-x",
          modeOctal: "755",
          userDisplay: "0",
          groupDisplay: "0",
        },
        {
          name: "README.txt",
          isDir: false,
          size: 12,
          mtime: Math.floor(Date.now() / 1000),
          modeDisplay: "-rw-r--r--",
          modeOctal: "644",
          userDisplay: "1000",
          groupDisplay: "1000",
        },
      ];
    case "list_local_dir":
      return [
        {
          name: "Documents",
          isDir: true,
          size: 0,
          mtime: null,
          modeDisplay: "drwxr-xr-x",
          modeOctal: "755",
          userDisplay: "e2e",
          groupDisplay: "e2e",
        },
        {
          name: "notes.md",
          isDir: false,
          size: 8,
          mtime: Math.floor(Date.now() / 1000),
          modeDisplay: "-rw-r--r--",
          modeOctal: "644",
          userDisplay: "e2e",
          groupDisplay: "e2e",
        },
      ];
    case "get_local_home_canonical_path":
      return "/home/e2e";
    case "sftp_download_file":
      return "/home/e2e/Downloads/mock-download.bin";
    case "sftp_export_paths_archive":
      return "/home/e2e/Downloads/mock-export.tar.gz";
    case "local_export_paths_archive":
      return "/home/e2e/Downloads/mock-local-export.tar.gz";
    case "sftp_upload_file":
    case "broadcast_file_transfer_clipboard":
    case "open_aux_window":
      return undefined;
    case "copy_local_file":
      return "/home/e2e/Documents/copied-file";
    case "create_local_dir":
    case "delete_local_entry":
    case "rename_local_entry":
    case "open_local_entry_in_os":
    case "sftp_create_dir":
    case "sftp_delete_entry":
    case "sftp_rename_entry":
      return undefined;
    case "list_plugins":
      return [
        {
          manifest: {
            id: "dev.nosuckshell.plugin.file-workspace",
            version: "0.0.0-e2e",
            displayName: "File workspace",
            capabilities: ["settingsUi"],
          },
          enabled: true,
          entitlementOk: true,
        },
        {
          manifest: {
            id: "dev.nosuckshell.plugin.demo",
            version: "0.0.0-e2e",
            displayName: "Demo plugin",
            capabilities: ["credentialProvider", "settingsUi"],
          },
          enabled: true,
          entitlementOk: true,
        },
      ];
    case "set_plugin_enabled":
      return undefined;
    case "plugin_invoke": {
      const method = args?.method as string;
      if (method === "ping") {
        return { ok: true, message: "pong", echo: args?.arg ?? {} };
      }
      throw new Error(`e2e plugin_invoke: unknown method ${method}`);
    }
    case "activate_license":
      return {
        v: 1,
        licenseId: "e2e",
        entitlements: [],
        iat: now(),
        exp: null,
      };
    case "license_status":
      return { active: false, licenseId: null, entitlements: [], exp: null };
    case "clear_license":
      return undefined;
    default:
      throw new Error(`e2e invoke not implemented: ${cmd}`);
  }
}
