use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use super::{StorageError, assert_safe_key};

/// Local disk (`LocalStorageDriver` in `lib/storage/local-driver.ts`): development, a single server or a mounted
/// volume. Writes go to a sibling temporary file and are renamed into place, so `/media` never serves half a variant.
pub struct LocalStorage {
    root: PathBuf,
}

impl LocalStorage {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        let root = root.into();
        let root = std::path::absolute(&root).unwrap_or(root);
        Self { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn resolve(&self, key: &str) -> Result<PathBuf, StorageError> {
        Ok(self.root.join(assert_safe_key(key)?))
    }

    pub async fn get(&self, key: &str) -> Result<Option<Vec<u8>>, StorageError> {
        let path = self.resolve(key)?;
        match tokio::fs::read(&path).await {
            Ok(bytes) => Ok(Some(bytes)),
            Err(error)
                if matches!(error.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory | ErrorKind::IsADirectory) =>
            {
                Ok(None)
            }
            Err(error) => Err(error.into()),
        }
    }

    pub async fn put(&self, key: &str, bytes: &[u8]) -> Result<(), StorageError> {
        let path = self.resolve(key)?;
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let file_name = path.file_name().and_then(|n| n.to_str()).ok_or(StorageError::InvalidKey)?;
        let temporary = path.with_file_name(format!(".{file_name}.{}.tmp", uuid::Uuid::new_v4().simple()));
        tokio::fs::write(&temporary, bytes).await?;
        if let Err(error) = tokio::fs::rename(&temporary, &path).await {
            let _ = tokio::fs::remove_file(&temporary).await;
            return Err(error.into());
        }
        Ok(())
    }

    /// B-031: removes an object. A missing one is not an error, so a retried purge simply continues.
    pub async fn delete(&self, key: &str) -> Result<(), StorageError> {
        let path = self.resolve(key)?;
        match tokio::fs::remove_file(&path).await {
            Ok(()) => Ok(()),
            Err(error) if matches!(error.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory) => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    /// B-031: every object key under `prefix` (which must end in `/`), sorted; a missing directory is an empty list.
    /// Symbolic links are neither followed nor listed, and only keys `assert_safe_key` accepts are returned (a crashed
    /// write's `.name.<uuid>.tmp` sibling included, so a purge removes it too).
    pub async fn list(&self, prefix: &str) -> Result<Vec<String>, StorageError> {
        let base = prefix.strip_suffix('/').ok_or(StorageError::InvalidKey)?;
        let mut keys = Vec::new();
        let mut pending = vec![(self.resolve(base)?, base.to_string())];
        while let Some((dir, dir_key)) = pending.pop() {
            let mut entries = match tokio::fs::read_dir(&dir).await {
                Ok(entries) => entries,
                Err(error) if matches!(error.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory) => continue,
                Err(error) => return Err(error.into()),
            };
            while let Some(entry) = entries.next_entry().await? {
                let Some(name) = entry.file_name().to_str().map(str::to_string) else { continue };
                let key = format!("{dir_key}/{name}");
                let kind = entry.file_type().await?;
                if kind.is_dir() {
                    pending.push((entry.path(), key));
                } else if kind.is_file() && assert_safe_key(&key).is_ok() {
                    keys.push(key);
                }
            }
        }
        keys.sort();
        Ok(keys)
    }
}
