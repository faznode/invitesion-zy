//! B-019: the object store the upload route writes (`lib/storage/`), read and written from Rust by the image-variant
//! job. Same drivers and selection rule as `getStorage()`: S3 when all four `S3_*` variables are set, a partial S3
//! configuration refused, a local root otherwise. Unlike Next.js, the local root is never derived from the working
//! directory: without S3 the jobs need `UPLOAD_ROOT` (fail closed rather than write somewhere unexpected).
//! Every driver applies `assert_safe_key`, the rule of `assertSafeKey` in `lib/storage/driver.ts`.

mod local;
mod s3;
pub mod sigv4;

pub use local::LocalStorage;
pub use s3::{S3Config, S3Storage};

use crate::config::ConfigError;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("unsafe storage key")]
    InvalidKey,
    #[error("storage io: {0}")]
    Io(#[from] std::io::Error),
    #[error("storage http: {0}")]
    Http(String),
}

pub enum Storage {
    Local(LocalStorage),
    S3(S3Storage),
}

impl Storage {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(&|name| std::env::var(name).ok())
    }

    pub fn from_lookup(env: &dyn Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        let value = |name: &str| env(name).map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        let s3 = [value("S3_BUCKET"), value("S3_REGION"), value("S3_ACCESS_KEY_ID"), value("S3_SECRET_ACCESS_KEY")];
        let configured = s3.iter().filter(|v| v.is_some()).count();
        if configured == 4 {
            let [bucket, region, access_key_id, secret_access_key] = s3.map(Option::unwrap_or_default);
            return Ok(Storage::S3(S3Storage::new(S3Config {
                bucket,
                region,
                access_key_id,
                secret_access_key,
                session_token: value("S3_SESSION_TOKEN"),
                endpoint: value("S3_ENDPOINT"),
                force_path_style: value("S3_FORCE_PATH_STYLE").as_deref() == Some("true"),
            })));
        }
        if configured > 0 {
            return Err(ConfigError::Invalid(
                "S3_* (all four of S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)",
            ));
        }
        let root = value("UPLOAD_ROOT").ok_or(ConfigError::Missing("UPLOAD_ROOT (or S3_*)"))?;
        Ok(Storage::Local(LocalStorage::new(root)))
    }

    pub fn name(&self) -> &'static str {
        match self {
            Storage::Local(_) => "local",
            Storage::S3(_) => "s3",
        }
    }

    /// The object's bytes, or `None` when it does not exist (an ordinary miss, not an error).
    pub async fn get(&self, key: &str) -> Result<Option<Vec<u8>>, StorageError> {
        match self {
            Storage::Local(local) => local.get(key).await,
            Storage::S3(s3) => s3.get(key).await,
        }
    }

    /// Writes (or overwrites) an object; a reader never sees a partial object.
    pub async fn put(&self, key: &str, bytes: Vec<u8>, content_type: &str) -> Result<(), StorageError> {
        match self {
            Storage::Local(local) => local.put(key, &bytes).await,
            Storage::S3(s3) => s3.put(key, bytes, content_type).await,
        }
    }

    /// B-031: removes an object; deleting a missing object succeeds (idempotent, so a purge can be retried).
    pub async fn delete(&self, key: &str) -> Result<(), StorageError> {
        match self {
            Storage::Local(local) => local.delete(key).await,
            Storage::S3(s3) => s3.delete(key).await,
        }
    }

    /// B-031: every key under `prefix` (ending in `/`), sorted. The purge lists an invitation's own prefixes, so an
    /// upload no row refers to any more (a replaced photo) is found and removed with the rest.
    pub async fn list(&self, prefix: &str) -> Result<Vec<String>, StorageError> {
        match self {
            Storage::Local(local) => local.list(prefix).await,
            Storage::S3(s3) => s3.list(prefix).await,
        }
    }
}

/// Rejects anything that could escape the storage root or be reinterpreted by a filesystem: POSIX-style relative keys
/// of `[A-Za-z0-9._-]` segments, no empty, `.` or `..` segment, at most 512 bytes.
pub fn assert_safe_key(key: &str) -> Result<&str, StorageError> {
    if key.is_empty() || key.len() > 512 || key.starts_with('/') || key.contains('\\') || key.contains('\0') {
        return Err(StorageError::InvalidKey);
    }
    for segment in key.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(StorageError::InvalidKey);
        }
        if !segment.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-')) {
            return Err(StorageError::InvalidKey);
        }
    }
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_keys_follow_the_typescript_rule() {
        for key in ["12/0123456789abcdef01234567.jpg", "variants/12/0123456789abcdef01234567/standard-640.webp", "a"] {
            assert!(assert_safe_key(key).is_ok(), "{key}");
        }
        let long = "a".repeat(513);
        for key in [
            "",
            "/12/a.jpg",
            "12//a.jpg",
            "12/./a.jpg",
            "12/../a.jpg",
            "12/a.jpg/",
            "12\\a.jpg",
            "12/a b.jpg",
            "12/ä.jpg",
            "12/a\0.jpg",
            long.as_str(),
        ] {
            assert!(assert_safe_key(key).is_err(), "{key:?}");
        }
    }

    #[test]
    fn the_driver_follows_getstorage_selection() {
        // Selecting S3 builds its reqwest client, which needs the rustls provider every entry point installs.
        crate::config::install_crypto_provider();
        let env = |pairs: &'static [(&'static str, &'static str)]| {
            move |name: &str| pairs.iter().find(|(k, _)| *k == name).map(|(_, v)| v.to_string())
        };
        assert!(matches!(Storage::from_lookup(&env(&[("UPLOAD_ROOT", "/tmp/uploads")])), Ok(Storage::Local(_))));
        assert!(matches!(
            Storage::from_lookup(&env(&[
                ("S3_BUCKET", "b"),
                ("S3_REGION", "ap-southeast-1"),
                ("S3_ACCESS_KEY_ID", "k"),
                ("S3_SECRET_ACCESS_KEY", "s"),
                ("UPLOAD_ROOT", "/tmp/uploads"),
            ])),
            Ok(Storage::S3(_))
        ));
        assert!(Storage::from_lookup(&env(&[("S3_BUCKET", "b"), ("UPLOAD_ROOT", "/tmp/uploads")])).is_err());
        assert!(Storage::from_lookup(&env(&[])).is_err());
    }
}
