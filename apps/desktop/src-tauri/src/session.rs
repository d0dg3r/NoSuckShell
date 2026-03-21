use crate::ssh_config::HostConfig;
use anyhow::Context;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtyPair, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
pub struct SessionOutputEvent {
    pub session_id: String,
    pub chunk: String,
    pub host_key_prompt: bool,
}

type SharedWriter = Arc<Mutex<Box<dyn Write + Send>>>;
type SharedMaster = Arc<Mutex<Box<dyn MasterPty + Send>>>;
type SharedChild = Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>;

/// Coalesce small PTY reads to reduce IPC event rate (slightly higher latency under flood).
const SESSION_OUTPUT_COALESCE_MAX_BYTES: usize = 16 * 1024;
const SESSION_OUTPUT_COALESCE_MAX_WAIT: Duration = Duration::from_millis(12);
const SESSION_OUTPUT_HOST_KEY_NEEDLE: &str = "Are you sure you want to continue connecting";

pub struct SessionHandle {
    writer: SharedWriter,
    master: SharedMaster,
    child: SharedChild,
}

#[derive(Default)]
pub struct SessionState {
    sessions: Mutex<HashMap<String, SessionHandle>>,
}

pub fn build_ssh_command(host: &HostConfig) -> CommandBuilder {
    let mut command = CommandBuilder::new("ssh");
    command.arg("-o");
    command.arg("StrictHostKeyChecking=ask");
    command.arg("-o");
    command.arg("UserKnownHostsFile=~/.ssh/known_hosts");
    command.arg("-p");
    command.arg(host.port.to_string());
    if !host.identity_file.is_empty() {
        command.arg("-i");
        command.arg(host.identity_file.clone());
    }
    if !host.proxy_jump.is_empty() {
        command.arg("-J");
        command.arg(host.proxy_jump.clone());
    }
    if !host.proxy_command.is_empty() {
        command.arg("-o");
        command.arg(format!("ProxyCommand={}", host.proxy_command));
    }
    if !host.user.is_empty() {
        command.arg(format!("{}@{}", host.user, host.host_name));
    } else {
        command.arg(host.host_name.clone());
    }
    command
}

fn resolve_local_shell_path(explicit_shell: Option<&str>) -> String {
    if let Some(shell) = explicit_shell {
        let trimmed = shell.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    if let Ok(shell_from_env) = env::var("SHELL") {
        let trimmed = shell_from_env.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    if Path::new("/bin/zsh").exists() {
        return "/bin/zsh".to_string();
    }
    if Path::new("/bin/bash").exists() {
        return "/bin/bash".to_string();
    }
    "sh".to_string()
}

pub fn build_local_shell_command(explicit_shell: Option<&str>) -> CommandBuilder {
    let shell = resolve_local_shell_path(explicit_shell);
    let mut command = CommandBuilder::new(shell);
    command.arg("-l");
    command
}

impl SessionState {
    pub fn start(&self, app: AppHandle, host: HostConfig) -> anyhow::Result<String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 30,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("failed to allocate pty")?;
        let command = build_ssh_command(&host);
        self.spawn_and_register_command(app, pair, command)
    }

    pub fn start_local(&self, app: AppHandle) -> anyhow::Result<String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 30,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("failed to allocate pty")?;
        let command = build_local_shell_command(None);
        self.spawn_and_register_command(app, pair, command)
    }

    fn spawn_and_register_command(
        &self,
        app: AppHandle,
        pair: PtyPair,
        mut command: CommandBuilder,
    ) -> anyhow::Result<String> {
        command.env("TERM", "xterm-256color");

        let child = pair
            .slave
            .spawn_command(command)
            .context("failed to spawn ssh process")?;
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .context("failed to create pty reader")?;
        let writer = pair
            .master
            .take_writer()
            .context("failed to create pty writer")?;

        let session_id = Uuid::new_v4().to_string();
        let child = Arc::new(Mutex::new(child));
        let writer = Arc::new(Mutex::new(writer));
        let master = Arc::new(Mutex::new(pair.master));

        {
            let mut sessions = self
                .sessions
                .lock()
                .map_err(|_| anyhow::anyhow!("session lock poisoned"))?;
            sessions.insert(
                session_id.clone(),
                SessionHandle {
                    writer: writer.clone(),
                    master: master.clone(),
                    child: child.clone(),
                },
            );
        }

        let session_id_for_thread = session_id.clone();
        std::thread::spawn(move || {
            let emit_chunk = |chunk: String| {
                let host_key_prompt = chunk.contains(SESSION_OUTPUT_HOST_KEY_NEEDLE);
                let _ = app.emit(
                    "session-output",
                    SessionOutputEvent {
                        session_id: session_id_for_thread.clone(),
                        chunk,
                        host_key_prompt,
                    },
                );
            };

            let mut buf = [0_u8; 8192];
            let mut pending = String::new();
            let mut pending_since: Option<Instant> = None;

            let flush_pending = |pending: &mut String, pending_since: &mut Option<Instant>, emit: &dyn Fn(String)| {
                if pending.is_empty() {
                    return;
                }
                *pending_since = None;
                let chunk = std::mem::take(pending);
                emit(chunk);
            };

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        flush_pending(&mut pending, &mut pending_since, &emit_chunk);
                        break;
                    }
                    Ok(read_len) => {
                        let fragment = String::from_utf8_lossy(&buf[..read_len]);
                        if pending.is_empty() && !fragment.is_empty() {
                            pending_since = Some(Instant::now());
                        }
                        pending.push_str(&fragment);

                        while pending.len() > SESSION_OUTPUT_COALESCE_MAX_BYTES {
                            let rest = pending.split_off(SESSION_OUTPUT_COALESCE_MAX_BYTES);
                            let chunk = std::mem::replace(&mut pending, rest);
                            pending_since = if pending.is_empty() {
                                None
                            } else {
                                Some(Instant::now())
                            };
                            emit_chunk(chunk);
                        }

                        if pending.contains(SESSION_OUTPUT_HOST_KEY_NEEDLE) {
                            flush_pending(&mut pending, &mut pending_since, &emit_chunk);
                            continue;
                        }

                        if let Some(since) = pending_since {
                            if !pending.is_empty() && since.elapsed() >= SESSION_OUTPUT_COALESCE_MAX_WAIT {
                                flush_pending(&mut pending, &mut pending_since, &emit_chunk);
                            }
                        }
                    }
                    Err(_) => {
                        flush_pending(&mut pending, &mut pending_since, &emit_chunk);
                        break;
                    }
                }
            }
        });

        Ok(session_id)
    }

    pub fn send_input(&self, session_id: &str, data: &str) -> anyhow::Result<()> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| anyhow::anyhow!("session lock poisoned"))?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| anyhow::anyhow!("unknown session"))?;
        let mut writer = session
            .writer
            .lock()
            .map_err(|_| anyhow::anyhow!("writer lock poisoned"))?;
        writer.write_all(data.as_bytes())?;
        writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> anyhow::Result<()> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| anyhow::anyhow!("session lock poisoned"))?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| anyhow::anyhow!("unknown session"))?;
        let master = session
            .master
            .lock()
            .map_err(|_| anyhow::anyhow!("master lock poisoned"))?;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("failed to resize pty")?;
        Ok(())
    }

    pub fn close(&self, session_id: &str) -> anyhow::Result<()> {
        let session = {
            let mut sessions = self
                .sessions
                .lock()
                .map_err(|_| anyhow::anyhow!("session lock poisoned"))?;
            sessions.remove(session_id)
        }
        .ok_or_else(|| anyhow::anyhow!("unknown session"))?;
        let mut child = session
            .child
            .lock()
            .map_err(|_| anyhow::anyhow!("child lock poisoned"))?;
        child.kill().context("failed to kill session")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{build_local_shell_command, build_ssh_command};
    use crate::ssh_config::HostConfig;

    #[test]
    fn builds_expected_ssh_command_with_proxy_and_identity() {
        let host = HostConfig {
            host: "prod".to_string(),
            host_name: "10.0.0.5".to_string(),
            user: "deploy".to_string(),
            port: 2201,
            identity_file: "~/.ssh/id_prod".to_string(),
            proxy_jump: "bastion".to_string(),
            proxy_command: String::new(),
        };

        let cmd = build_ssh_command(&host);
        let rendered = format!("{cmd:?}");
        assert!(rendered.contains("ssh"));
        assert!(rendered.contains("-p"));
        assert!(rendered.contains("2201"));
        assert!(rendered.contains("-i"));
        assert!(rendered.contains("~/.ssh/id_prod"));
        assert!(rendered.contains("-J"));
        assert!(rendered.contains("bastion"));
        assert!(rendered.contains("deploy@10.0.0.5"));
    }

    #[test]
    fn builds_local_shell_command_from_explicit_shell() {
        let cmd = build_local_shell_command(Some("/usr/bin/fish"));
        let rendered = format!("{cmd:?}");
        assert!(rendered.contains("/usr/bin/fish"));
        assert!(rendered.contains("-l"));
    }
}
