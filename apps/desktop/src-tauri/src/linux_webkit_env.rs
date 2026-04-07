//! On some Linux stacks, WebKitGTK + DMA-BUF on Wayland yields a blank or unstable webview.
//! If the user has not set `WEBKIT_DISABLE_DMABUF_RENDERER`, default it when we detect Wayland.

const WEBKIT_DMABUF_VAR: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";

pub fn apply_wayland_dmabuf_default() {
    if std::env::var_os(WEBKIT_DMABUF_VAR).is_some() {
        return;
    }
    let wayland = std::env::var_os("WAYLAND_DISPLAY");
    let session = std::env::var("XDG_SESSION_TYPE").ok();
    if session_looks_like_wayland(wayland.as_deref(), session.as_deref()) {
        // SAFETY: `set_var` is `unsafe` in Rust 2024 due to process-wide environment races.
        // Here we are at the start of `main` before other threads spawn and before WebKit reads this variable.
        unsafe {
            std::env::set_var(WEBKIT_DMABUF_VAR, "1");
        }
    }
}

fn session_looks_like_wayland(
    wayland_display: Option<&std::ffi::OsStr>,
    xdg_session_type: Option<&str>,
) -> bool {
    if wayland_display.is_some() {
        return true;
    }
    xdg_session_type.is_some_and(|s| s == "wayland")
}

#[cfg(test)]
mod tests {
    use super::session_looks_like_wayland;
    use std::ffi::OsStr;

    #[test]
    fn wayland_display_set_implies_wayland() {
        assert!(session_looks_like_wayland(Some(OsStr::new("wayland-1")), None));
        assert!(session_looks_like_wayland(Some(OsStr::new("wayland-1")), Some("x11")));
    }

    #[test]
    fn xdg_session_type_wayland_implies_wayland() {
        assert!(session_looks_like_wayland(None, Some("wayland")));
    }

    #[test]
    fn x11_like_session_not_wayland() {
        assert!(!session_looks_like_wayland(None, None));
        assert!(!session_looks_like_wayland(None, Some("x11")));
        assert!(!session_looks_like_wayland(None, Some("tty")));
    }
}
