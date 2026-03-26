use std::fmt;

/// A wrapper for sensitive strings that masks them in `Debug` and `Display` implementations.
/// This prevents accidental leakage into logs and satisfies security scanners like CodeQL.
#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct SecretString(String);

impl SecretString {
    pub fn new(s: impl Into<String>) -> Self {
        Self(s.into())
    }

    pub fn expose_secret(&self) -> &str {
        &self.0
    }

}

impl From<String> for SecretString {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for SecretString {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[REDACTED]")
    }
}

impl fmt::Display for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[REDACTED]")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_debug_and_display() {
        let s = SecretString::new("my-secret-pem");
        assert_eq!(format!("{}", s), "[REDACTED]");
        assert_eq!(format!("{:?}", s), "[REDACTED]");
    }

    #[test]
    fn exposes_secret_intentionally() {
        let s = SecretString::new("my-secret-pem");
        assert_eq!(s.expose_secret(), "my-secret-pem");
    }
}
