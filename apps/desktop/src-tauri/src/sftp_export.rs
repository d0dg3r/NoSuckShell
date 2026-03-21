//! Archive export from remote (SSH exec + SFTP) or local disk, with free-space checks on the side that builds the archive.

use crate::sftp::{
    connect_session, normalize_remote_path, remote_child_path, resolve_local_browser_path, resolve_remote_spec,
    validate_entry_name, RemoteSshSpec,
};
use crate::ssh_config::HostConfig;
use ssh2::Session;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

const SIZE_MARGIN_NUM: u64 = 11;
const SIZE_MARGIN_DEN: u64 = 10;
const MIN_HEADROOM_BYTES: u64 = 512 * 1024;

fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\"'\"'"))
}

fn session_exec(sess: &Session, command: &str) -> Result<(String, i32), String> {
    sess.set_blocking(true);
    let mut channel = sess
        .channel_session()
        .map_err(|e| format!("SSH channel: {e}"))?;
    channel
        .exec(command)
        .map_err(|e| format!("SSH exec: {e}"))?;

    let mut stdout = Vec::new();
    channel
        .read_to_end(&mut stdout)
        .map_err(|e| format!("Read remote command output: {e}"))?;

    let mut stderr = Vec::new();
    let _ = channel.stderr().read_to_end(&mut stderr);

    channel
        .wait_close()
        .map_err(|e| format!("SSH channel close: {e}"))?;
    let status = channel
        .exit_status()
        .map_err(|e| format!("SSH exit status: {e}"))?;

    let out = String::from_utf8_lossy(&stdout).trim().to_string();
    let err_s = String::from_utf8_lossy(&stderr).trim().to_string();
    let combined = if err_s.is_empty() {
        out
    } else if out.is_empty() {
        err_s
    } else {
        format!("{out}\n{err_s}")
    };
    Ok((combined, status))
}

/// Parse last line of `df -P -B1`: Available bytes in column 4 (GNU coreutils).
fn parse_df_b1_avail(line: &str) -> Option<u64> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 4 {
        return None;
    }
    parts[3].parse::<u64>().ok()
}

fn remote_temp_base(sess: &Session) -> Result<String, String> {
    let (out, st) = session_exec(sess, "sh -c 'echo \"${TMPDIR:-/tmp}\"'")?;
    if st != 0 {
        return Ok("/tmp".to_string());
    }
    let t = out.trim();
    if t.is_empty() || !t.starts_with('/') {
        Ok("/tmp".to_string())
    } else {
        Ok(t.to_string())
    }
}

fn remote_df_avail_bytes(sess: &Session, path: &str) -> Result<u64, String> {
    let inner = format!("df -P -B1 {} 2>/dev/null | tail -n 1", sh_quote(path));
    let cmd = format!("sh -c {}", sh_quote(&inner));
    let (out, st) = session_exec(sess, &cmd)?;
    if st != 0 {
        return Err(format!(
            "Could not read free disk space on the server (df failed): {out}"
        ));
    }
    let line = out.lines().last().unwrap_or(&out).trim();
    parse_df_b1_avail(line).ok_or_else(|| {
        format!("Could not parse free disk space from server: {out:?}")
    })
}

fn remote_du_total_bytes(sess: &Session, paths: &[String]) -> Result<Option<u64>, String> {
    if paths.is_empty() {
        return Ok(Some(0));
    }
    let mut inner = String::from("du -sb");
    for p in paths {
        inner.push(' ');
        inner.push_str(&sh_quote(p));
    }
    inner.push_str(" 2>/dev/null | awk '{s+=$1} END {print s+0}'");
    let cmd = format!("sh -c {}", sh_quote(&inner));
    let (out, st) = session_exec(sess, &cmd)?;
    if st != 0 {
        return Ok(None);
    }
    Ok(out.trim().parse::<u64>().ok())
}

fn sftp_tree_size(sftp: &ssh2::Sftp, path: &Path) -> Result<u64, String> {
    let stat = sftp
        .stat(path)
        .map_err(|e| format!("Stat {}: {e}", path.display()))?;
    if stat.is_file() {
        return Ok(stat.size.unwrap_or(0));
    }
    if !stat.is_dir() {
        return Ok(0);
    }
    let mut sum: u64 = 0;
    let rows = sftp
        .readdir(path)
        .map_err(|e| format!("Read directory {}: {e}", path.display()))?;
    for (child_path, st) in rows {
        let name = child_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if name.is_empty() || name == "." || name == ".." {
            continue;
        }
        if st.is_file() {
            sum += st.size.unwrap_or(0);
        } else if st.is_dir() {
            sum += sftp_tree_size(sftp, &child_path)?;
        }
    }
    Ok(sum)
}

fn unlink_remote_file(host: &HostConfig, remote_path: &str) -> Result<(), String> {
    let sess = connect_session(host)?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP cleanup: {e}"))?;
    sftp
        .unlink(Path::new(remote_path))
        .map_err(|e| format!("Remove remote temp archive: {e}"))?;
    Ok(())
}

fn unique_output_path(dest_base: &Path, stem: &str, ext: &str) -> PathBuf {
    let mut local_name = format!("{stem}.{ext}");
    let mut local_path = dest_base.join(&local_name);
    let mut suffix = 1u32;
    while local_path.exists() {
        local_name = format!("{stem}-{suffix}.{ext}");
        local_path = dest_base.join(&local_name);
        suffix += 1;
    }
    local_path
}

fn archive_stem(names: &[String], local_output_base_name: Option<String>) -> String {
    local_output_base_name
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().replace(['/', '\\'], "_"))
        .unwrap_or_else(|| {
            if names.len() == 1 {
                names[0].clone()
            } else {
                "selected-items".to_string()
            }
        })
}

/// Pack remote entries under `parent_path` into tar.gz or zip on the server, download, delete remote temp.
pub fn export_remote_archive(
    spec: RemoteSshSpec,
    parent_path: String,
    names: Vec<String>,
    format: String,
    dest_dir_path: String,
    local_output_base_name: Option<String>,
) -> Result<String, String> {
    if names.is_empty() {
        return Err("Nothing to export.".to_string());
    }
    for n in &names {
        validate_entry_name(n)?;
    }
    let host = resolve_remote_spec(spec)?;

    let parent_for_sftp = {
        let p = normalize_remote_path(&parent_path)?;
        if p.is_empty() || p == "." {
            ".".to_string()
        } else {
            p
        }
    };

    let mut dest_base = resolve_local_browser_path(dest_dir_path)?;
    if !dest_base.exists() {
        fs::create_dir_all(&dest_base).map_err(|e| format!("Create destination dir: {e}"))?;
        dest_base = dest_base
            .canonicalize()
            .map_err(|e| format!("Destination directory: {e}"))?;
    } else {
        dest_base = dest_base
            .canonicalize()
            .map_err(|e| format!("Destination directory: {e}"))?;
    }
    if !dest_base.is_dir() {
        return Err("Destination is not a directory.".to_string());
    }

    let fmt = format.trim().to_lowercase();
    let use_zip = fmt == "zip";

    let sess = connect_session(&host)?;

    let parent_abs = {
        let sftp = sess.sftp().map_err(|e| format!("SFTP: {e}"))?;
        let p = Path::new(&parent_for_sftp);
        let pb = sftp
            .realpath(p)
            .map_err(|e| format!("Resolve remote path: {e}"))?;
        pb.to_string_lossy().into_owned()
    };

    {
        let sftp = sess.sftp().map_err(|e| format!("SFTP: {e}"))?;
        for n in &names {
            let rel = remote_child_path(&parent_for_sftp, n)?;
            let pb = Path::new(&rel);
            sftp
                .stat(pb)
                .map_err(|e| format!("'{n}' is not readable on server: {e}"))?;
        }
    }

    let mut full_paths: Vec<String> = Vec::new();
    {
        let sftp = sess.sftp().map_err(|e| format!("SFTP: {e}"))?;
        for n in &names {
            let rel = remote_child_path(&parent_for_sftp, n)?;
            let pb = Path::new(&rel);
            let abs = sftp
                .realpath(pb)
                .map_err(|e| format!("realpath {n}: {e}"))?;
            full_paths.push(abs.to_string_lossy().into_owned());
        }
    }

    let tmp_base = remote_temp_base(&sess)?;
    let avail = remote_df_avail_bytes(&sess, &tmp_base)?;

    let need_bytes = if let Some(du) = remote_du_total_bytes(&sess, &full_paths)? {
        du
    } else {
        let sftp = sess.sftp().map_err(|e| format!("SFTP: {e}"))?;
        let mut s = 0u64;
        for fp in &full_paths {
            s += sftp_tree_size(&sftp, Path::new(fp))?;
        }
        s
    };

    let required = need_bytes
        .saturating_mul(SIZE_MARGIN_NUM)
        / SIZE_MARGIN_DEN
        + MIN_HEADROOM_BYTES;
    if required > avail {
        return Err(format!(
            "Not enough free space on the server to build the archive (need about {} B, {} B available under {}).",
            required, avail, tmp_base
        ));
    }

    let id = Uuid::new_v4();
    let remote_archive = format!(
        "{}/nss-export-{}.{}",
        tmp_base.trim_end_matches('/'),
        id,
        if use_zip { "zip" } else { "tar.gz" }
    );

    let tar_or_zip_cmd = if use_zip {
        let mut inner = format!(
            "(cd {} && zip -r -q {} ",
            sh_quote(&parent_abs),
            sh_quote(&remote_archive)
        );
        for n in &names {
            inner.push_str(&sh_quote(n));
            inner.push(' ');
        }
        inner.push(')');
        format!("sh -c {}", sh_quote(inner.trim()))
    } else {
        let mut inner = format!(
            "tar czf {} -C {} --",
            sh_quote(&remote_archive),
            sh_quote(&parent_abs)
        );
        for n in &names {
            inner.push(' ');
            inner.push_str(&sh_quote(n));
        }
        format!("sh -c {}", sh_quote(&inner))
    };

    let (exec_out, st) = session_exec(&sess, &tar_or_zip_cmd)?;
    if st != 0 {
        let _ = unlink_remote_file(&host, &remote_archive);
        return Err(format!(
            "Remote archive command failed (exit {st}). stderr/stdout: {exec_out}"
        ));
    }

    let stem = archive_stem(&names, local_output_base_name);
    let ext = if use_zip { "zip" } else { "tar.gz" };
    let local_path = unique_output_path(&dest_base, &stem, ext);

    {
        let sftp = sess.sftp().map_err(|e| format!("SFTP: {e}"))?;
        let mut rf = sftp
            .open(Path::new(&remote_archive))
            .map_err(|e| format!("Open remote archive: {e}"))?;
        let mut out = fs::File::create(&local_path).map_err(|e| format!("Create local file: {e}"))?;
        let mut buf = [0u8; 256 * 1024];
        loop {
            let n = rf
                .read(&mut buf)
                .map_err(|e| format!("Read archive: {e}"))?;
            if n == 0 {
                break;
            }
            std::io::Write::write_all(&mut out, &buf[..n]).map_err(|e| format!("Write local: {e}"))?;
        }
    }

    unlink_remote_file(&host, &remote_archive)?;

    Ok(local_path.to_string_lossy().into_owned())
}

fn local_entry_size(path: &Path) -> Result<u64, std::io::Error> {
    let meta = fs::metadata(path)?;
    if meta.is_file() {
        return Ok(meta.len());
    }
    if !meta.is_dir() {
        return Ok(0);
    }
    let mut sum = 0u64;
    for entry in fs::read_dir(path)? {
        let e = entry?;
        sum += local_entry_size(&e.path())?;
    }
    Ok(sum)
}

/// Pack local entries into tar.gz or zip in `dest_dir_path`.
pub fn export_local_archive(
    parent_path_key: String,
    names: Vec<String>,
    format: String,
    dest_dir_path: String,
    local_output_base_name: Option<String>,
) -> Result<String, String> {
    if names.is_empty() {
        return Err("Nothing to export.".to_string());
    }
    for n in &names {
        validate_entry_name(n)?;
    }

    let parent_dir = resolve_local_browser_path(parent_path_key)?;
    let parent_dir = parent_dir
        .canonicalize()
        .map_err(|e| format!("Parent directory: {e}"))?;
    if !parent_dir.is_dir() {
        return Err("Parent is not a directory.".to_string());
    }

    let mut dest_base = resolve_local_browser_path(dest_dir_path)?;
    if !dest_base.exists() {
        fs::create_dir_all(&dest_base).map_err(|e| format!("Create destination dir: {e}"))?;
        dest_base = dest_base
            .canonicalize()
            .map_err(|e| format!("Destination directory: {e}"))?;
    } else {
        dest_base = dest_base
            .canonicalize()
            .map_err(|e| format!("Destination directory: {e}"))?;
    }
    if !dest_base.is_dir() {
        return Err("Destination is not a directory.".to_string());
    }

    let fmt = format.trim().to_lowercase();
    let use_zip = fmt == "zip";

    let mut need_bytes: u64 = 0;
    for n in &names {
        let p = parent_dir.join(n.trim());
        let p = p
            .canonicalize()
            .map_err(|e| format!("Path {n}: {e}"))?;
        if !p.starts_with(&parent_dir) {
            return Err("Invalid path.".to_string());
        }
        need_bytes += local_entry_size(&p).map_err(|e| format!("Size {n}: {e}"))?;
    }

    let avail = fs2::available_space(&dest_base).map_err(|e| format!("Disk space: {e}"))?;
    let required = need_bytes
        .saturating_mul(SIZE_MARGIN_NUM)
        / SIZE_MARGIN_DEN
        + MIN_HEADROOM_BYTES;
    if required > avail {
        return Err(format!(
            "Not enough free space to build the archive locally (need about {} B, {} B available on destination volume).",
            required, avail
        ));
    }

    let stem = archive_stem(&names, local_output_base_name);
    let ext = if use_zip { "zip" } else { "tar.gz" };
    let local_path = unique_output_path(&dest_base, &stem, ext);
    let fname = local_path
        .file_name()
        .ok_or_else(|| "Invalid archive file name.".to_string())?
        .to_string_lossy();
    let out_part = dest_base.join(format!("{fname}.nsspart"));

    let status = if use_zip {
        let mut c = Command::new("zip");
        c.arg("-r")
            .arg("-q")
            .arg(&out_part)
            .current_dir(&parent_dir);
        for n in &names {
            c.arg(n.trim());
        }
        c.status()
    } else {
        let mut c = Command::new("tar");
        c.arg("czf").arg(&out_part).arg("-C").arg(&parent_dir).arg("--");
        for n in &names {
            c.arg(n.trim());
        }
        c.status()
    }
    .map_err(|e| format!("Start archive command: {e}"))?;

    if !status.success() {
        let _ = fs::remove_file(&out_part);
        return Err("Local archive command failed (tar or zip).".to_string());
    }

    fs::rename(&out_part, &local_path).map_err(|e| {
        let _ = fs::remove_file(&out_part);
        format!("Finalize archive: {e}")
    })?;

    Ok(local_path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_df_line() {
        let line = "/dev/sda1  1000  500  500  50% /";
        assert_eq!(parse_df_b1_avail(line), Some(500));
    }

    #[test]
    fn sh_quote_escapes_single_quote() {
        assert_eq!(sh_quote("a'b"), "'a'\"'\"'b'");
    }
}
