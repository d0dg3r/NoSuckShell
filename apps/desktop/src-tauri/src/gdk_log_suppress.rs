//! WebKitGTK on Wayland often logs Gdk-WARNING "Error writing selection data … Broken pipe"
//! when a clipboard/selection peer disconnects before reading the full offer. This is usually
//! harmless; suppress only that substring so real Gdk issues still surface.

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_void};

type GLogLevelFlags = u32;

#[allow(non_upper_case_globals)]
const G_LOG_LEVEL_WARNING: GLogLevelFlags = 1 << 5;

unsafe extern "C" fn gdk_filter_handler(
    log_domain: *const c_char,
    log_level: GLogLevelFlags,
    message: *const c_char,
    _user_data: *mut c_void,
) {
    if !message.is_null() {
        let msg = unsafe { CStr::from_ptr(message) }.to_string_lossy();
        if msg.contains("Error writing selection data") && msg.contains("Broken pipe") {
            return;
        }
    }
    unsafe {
        g_log_default_handler(log_domain, log_level, message, std::ptr::null_mut());
    }
}

#[link(name = "glib-2.0")]
unsafe extern "C" {
    fn g_log_set_handler(
        log_domain: *const c_char,
        log_levels: GLogLevelFlags,
        log_func: unsafe extern "C" fn(*const c_char, GLogLevelFlags, *const c_char, *mut c_void),
        user_data: *mut c_void,
    ) -> u32;
    fn g_log_default_handler(
        log_domain: *const c_char,
        log_level: GLogLevelFlags,
        message: *const c_char,
        unused_data: *mut c_void,
    );
}

pub fn install_gdk_broken_pipe_selection_filter() {
    let Ok(domain) = CString::new("Gdk") else {
        return;
    };
    let ptr = domain.as_ptr();
    std::mem::forget(domain);
    unsafe {
        let _id = g_log_set_handler(
            ptr,
            G_LOG_LEVEL_WARNING,
            gdk_filter_handler,
            std::ptr::null_mut(),
        );
    }
}
