//! CLI flags for one-shot launch layouts (see `get_launch_cli_profile` IPC).

use serde::Serialize;
use std::io::{self, Write};
use std::sync::OnceLock;

static PROFILE: OnceLock<LaunchCliProfile> = OnceLock::new();

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchCliProfile {
    pub local_commander: bool,
    pub single_local_shell: bool,
    pub error: Option<String>,
}

const CONFLICT_USER_MESSAGE: &str =
    "Cannot use --local-commander (-c) and --local-terminal (-t) together. (Aliases: --commander, --single-shell.)";

pub fn wants_help(args: &[String]) -> bool {
    args.iter().any(|a| a == "-h" || a == "--help")
}

pub fn print_help() {
    let text = concat!(
        "NoSuckShell — SSH manager (desktop)\n",
        "\n",
        "Usage:\n",
        "  nosuckshell [options]\n",
        "\n",
        "Options:\n",
        "  -h, --help               Show this help and exit\n",
        "  -c, --local-commander    Open an NSS-Commander workspace (dual local file panes at home);\n",
        "                           collapse the host sidebar. Not an SSH session.\n",
        "      --commander          Same as --local-commander (deprecated alias)\n",
        "  -t, --local-terminal     Single Main workspace with one local terminal;\n",
        "                           collapse the host sidebar\n",
        "      --single-shell       Same as --local-terminal (deprecated alias)\n",
        "\n",
        "Only one of --local-commander / --local-terminal (or their short forms or aliases) may be used.\n",
        "\n",
        "Development: from the repository root, see README.md — use `npm run tauri:dev -- …` so flags reach\n",
        "the app (the root script adds the separators Tauri expects).\n",
    );
    let _ = io::stdout().write_all(text.as_bytes());
    let _ = io::stdout().flush();
}

fn apply_mode_arg(commander: &mut bool, single: &mut bool, arg: &str) {
    match arg {
        "--local-commander" | "--commander" | "-c" => *commander = true,
        "--local-terminal" | "--single-shell" | "-t" => *single = true,
        _ => {}
    }
}

fn parse_launch_args(args: impl Iterator<Item = String>) -> LaunchCliProfile {
    let mut commander = false;
    let mut single_shell = false;
    for arg in args {
        apply_mode_arg(&mut commander, &mut single_shell, arg.as_str());
    }
    if commander && single_shell {
        eprintln!("NoSuckShell: {CONFLICT_USER_MESSAGE}");
        return LaunchCliProfile {
            local_commander: false,
            single_local_shell: false,
            error: Some(CONFLICT_USER_MESSAGE.to_string()),
        };
    }
    LaunchCliProfile {
        local_commander: commander,
        single_local_shell: single_shell,
        error: None,
    }
}

/// Call once from `main` after handling `--help`, before the Tauri event loop.
pub fn init_from_args(args: &[String]) {
    let profile = parse_launch_args(args.iter().cloned());
    let _ = PROFILE.set(profile);
}

pub fn current_profile() -> LaunchCliProfile {
    PROFILE
        .get()
        .cloned()
        .unwrap_or_else(|| LaunchCliProfile {
            local_commander: false,
            single_local_shell: false,
            error: None,
        })
}

#[cfg(test)]
mod tests {
    use super::{
        parse_launch_args, wants_help, LaunchCliProfile, CONFLICT_USER_MESSAGE,
    };

    fn p(args: &[&str]) -> LaunchCliProfile {
        parse_launch_args(args.iter().map(|s| (*s).to_string()))
    }

    #[test]
    fn no_args_is_empty_profile() {
        let x = p(&[]);
        assert!(!x.local_commander);
        assert!(!x.single_local_shell);
        assert!(x.error.is_none());
    }

    #[test]
    fn wants_help_h_and_long() {
        assert!(wants_help(&["-h".into()]));
        assert!(wants_help(&["--help".into()]));
        assert!(wants_help(&["--foo".into(), "--help".into()]));
        assert!(!wants_help(&[]));
        assert!(!wants_help(&["--local-commander".into()]));
    }

    #[test]
    fn local_commander_long_and_short_and_alias() {
        assert!(p(&["--local-commander"]).local_commander);
        assert!(p(&["-c"]).local_commander);
        assert!(p(&["--commander"]).local_commander);
    }

    #[test]
    fn local_terminal_long_and_short_and_alias() {
        assert!(p(&["--local-terminal"]).single_local_shell);
        assert!(p(&["-t"]).single_local_shell);
        assert!(p(&["--single-shell"]).single_local_shell);
    }

    #[test]
    fn commander_alias_still_works() {
        let x = p(&["--commander"]);
        assert!(x.local_commander);
        assert!(!x.single_local_shell);
        assert!(x.error.is_none());
    }

    #[test]
    fn single_shell_alias_still_works() {
        let x = p(&["--single-shell"]);
        assert!(!x.local_commander);
        assert!(x.single_local_shell);
        assert!(x.error.is_none());
    }

    #[test]
    fn both_flags_conflict_new_names() {
        let x = p(&["--local-commander", "--local-terminal"]);
        assert!(!x.local_commander);
        assert!(!x.single_local_shell);
        assert_eq!(x.error.as_deref(), Some(CONFLICT_USER_MESSAGE));
    }

    #[test]
    fn both_flags_conflict_short_forms() {
        let x = p(&["-c", "-t"]);
        assert_eq!(x.error.as_deref(), Some(CONFLICT_USER_MESSAGE));
    }

    #[test]
    fn both_flags_conflict_legacy_names() {
        let x = p(&["--commander", "--single-shell"]);
        assert_eq!(x.error.as_deref(), Some(CONFLICT_USER_MESSAGE));
    }

    #[test]
    fn ignores_unknown_args() {
        let x = p(&["--foo", "-c", "positional"]);
        assert!(x.local_commander);
        assert!(x.error.is_none());
    }
}
