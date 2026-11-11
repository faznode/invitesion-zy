use time::OffsetDateTime;
use url::Url;

use super::sigv4::{SignInput, sha256_hex, sign_request, uri_encode};
use super::{StorageError, assert_safe_key};

const EMPTY_SHA256: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

#[derive(Clone)]
pub struct S3Config {
    pub bucket: String,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: Option<String>,
    /// Custom endpoint for S3-compatible providers (Cloudflare R2, MinIO, Backblaze B2); `None` for AWS itself.
    pub endpoint: Option<String>,
    /// `endpoint/bucket/key` instead of `bucket.endpoint/key` (`S3_FORCE_PATH_STYLE=true`).
    pub force_path_style: bool,
}

/// S3-compatible object storage (`S3StorageDriver` in `lib/storage/s3-driver.ts`): single-object GET and PUT, signed
/// in-repo with SigV4 rather than through an SDK.
pub struct S3Storage {
    config: S3Config,
    client: reqwest::Client,
}

impl S3Storage {
    pub fn new(config: S3Config) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self { config, client }
    }

    /// Same addressing as the TypeScript driver with the configuration `getStorage()` builds: path-style exactly when
    /// `S3_FORCE_PATH_STYLE=true`, otherwise the bucket as a subdomain of the endpoint (AWS by default).
    pub fn endpoint_for(&self, key: &str) -> Result<String, StorageError> {
        let encoded = uri_encode(assert_safe_key(key)?, false);
        let base = match &self.config.endpoint {
            Some(endpoint) => endpoint.trim_end_matches('/').to_string(),
            None => format!("https://s3.{}.amazonaws.com", self.config.region),
        };
        if self.config.force_path_style {
            return Ok(format!("{base}/{}/{encoded}", self.config.bucket));
        }
        let mut url = Url::parse(&base).map_err(|e| StorageError::Http(format!("endpoint: {e}")))?;
        let host = url.host_str().ok_or_else(|| StorageError::Http("endpoint has no host".into()))?.to_string();
        url.set_host(Some(&format!("{}.{host}", self.config.bucket)))
            .map_err(|e| StorageError::Http(format!("endpoint: {e}")))?;
        url.set_path(&format!("/{encoded}"));
        Ok(url.to_string())
    }

    fn sign(
        &self,
        method: &str,
        url: &str,
        payload_hash: &str,
        extra: &[(&str, &str)],
    ) -> Result<Vec<(String, String)>, StorageError> {
        let mut headers: Vec<(&str, &str)> = vec![("x-amz-content-sha256", payload_hash)];
        headers.extend_from_slice(extra);
        sign_request(&SignInput {
            method,
            url,
            region: &self.config.region,
            service: "s3",
            access_key_id: &self.config.access_key_id,
            secret_access_key: &self.config.secret_access_key,
            session_token: self.config.session_token.as_deref(),
            payload_hash,
            headers: &headers,
            date: OffsetDateTime::now_utc(),
        })
        .map_err(|e| StorageError::Http(format!("sign: {e}")))
    }

    pub async fn get(&self, key: &str) -> Result<Option<Vec<u8>>, StorageError> {
        let url = self.endpoint_for(key)?;
        let mut request = self.client.get(&url);
        for (name, value) in self.sign("GET", &url, EMPTY_SHA256, &[])? {
            if name != "host" {
                request = request.header(name, value);
            }
        }
        let response = request.send().await.map_err(|e| StorageError::Http(format!("GET: {e}")))?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err(StorageError::Http(format!("GET {}", response.status().as_u16())));
        }
        let bytes = response.bytes().await.map_err(|e| StorageError::Http(format!("GET body: {e}")))?;
        Ok(Some(bytes.to_vec()))
    }

    pub async fn put(&self, key: &str, bytes: Vec<u8>, content_type: &str) -> Result<(), StorageError> {
        let url = self.endpoint_for(key)?;
        let payload_hash = sha256_hex(&bytes);
        let length = bytes.len().to_string();
        let mut request = self.client.put(&url);
        for (name, value) in
            self.sign("PUT", &url, &payload_hash, &[("content-type", content_type), ("content-length", &length)])?
        {
            if name != "host" {
                request = request.header(name, value);
            }
        }
        let response = request.body(bytes).send().await.map_err(|e| StorageError::Http(format!("PUT: {e}")))?;
        if !response.status().is_success() {
            return Err(StorageError::Http(format!("PUT {}", response.status().as_u16())));
        }
        Ok(())
    }

    /// B-031: single-object DELETE. S3 answers 204 whether or not the key existed; a compatible store's 404 for a
    /// missing key counts as deleted too.
    pub async fn delete(&self, key: &str) -> Result<(), StorageError> {
        let url = self.endpoint_for(key)?;
        let mut request = self.client.delete(&url);
        for (name, value) in self.sign("DELETE", &url, EMPTY_SHA256, &[])? {
            if name != "host" {
                request = request.header(name, value);
            }
        }
        let response = request.send().await.map_err(|e| StorageError::Http(format!("DELETE: {e}")))?;
        if response.status().is_success() || response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }
        Err(StorageError::Http(format!("DELETE {}", response.status().as_u16())))
    }

    /// The bucket's root URL under the same addressing rule as `endpoint_for`.
    fn bucket_url(&self) -> Result<Url, StorageError> {
        let base = match &self.config.endpoint {
            Some(endpoint) => endpoint.trim_end_matches('/').to_string(),
            None => format!("https://s3.{}.amazonaws.com", self.config.region),
        };
        let mut url = Url::parse(&base).map_err(|e| StorageError::Http(format!("endpoint: {e}")))?;
        if self.config.force_path_style {
            url.set_path(&format!("/{}/", self.config.bucket));
        } else {
            let host = url.host_str().ok_or_else(|| StorageError::Http("endpoint has no host".into()))?.to_string();
            url.set_host(Some(&format!("{}.{host}", self.config.bucket)))
                .map_err(|e| StorageError::Http(format!("endpoint: {e}")))?;
            url.set_path("/");
        }
        Ok(url)
    }

    /// B-031: ListObjectsV2 under `prefix` (which must end in `/`), following continuation tokens. Only keys inside
    /// the prefix that `assert_safe_key` accepts are returned, sorted. Needs `s3:ListBucket` on the bucket.
    pub async fn list(&self, prefix: &str) -> Result<Vec<String>, StorageError> {
        if !prefix.ends_with('/') {
            return Err(StorageError::InvalidKey);
        }
        assert_safe_key(prefix.trim_end_matches('/'))?;
        let mut keys = Vec::new();
        let mut token: Option<String> = None;
        for _page in 0..10_000 {
            let mut url = self.bucket_url()?;
            {
                let mut query = url.query_pairs_mut();
                query.append_pair("list-type", "2").append_pair("prefix", prefix);
                if let Some(token) = &token {
                    query.append_pair("continuation-token", token);
                }
            }
            let url = url.to_string();
            let mut request = self.client.get(&url);
            for (name, value) in self.sign("GET", &url, EMPTY_SHA256, &[])? {
                if name != "host" {
                    request = request.header(name, value);
                }
            }
            let response = request.send().await.map_err(|e| StorageError::Http(format!("LIST: {e}")))?;
            if !response.status().is_success() {
                return Err(StorageError::Http(format!("LIST {}", response.status().as_u16())));
            }
            let body = response.text().await.map_err(|e| StorageError::Http(format!("LIST body: {e}")))?;
            keys.extend(
                xml_values(&body, "Key")
                    .into_iter()
                    .filter(|key| key.starts_with(prefix) && assert_safe_key(key).is_ok()),
            );
            if xml_values(&body, "IsTruncated").first().map(String::as_str) != Some("true") {
                keys.sort();
                keys.dedup();
                return Ok(keys);
            }
            token = Some(
                xml_values(&body, "NextContinuationToken")
                    .into_iter()
                    .next()
                    .ok_or_else(|| StorageError::Http("LIST truncated without a continuation token".into()))?,
            );
        }
        Err(StorageError::Http("LIST did not finish".into()))
    }
}

/// The text of every `<tag>…</tag>` element in a ListObjectsV2 response, entity-decoded. The response is flat enough
/// for this (no nesting of the tags read here), which keeps an XML parser out of the dependency tree.
pub fn xml_values(body: &str, tag: &str) -> Vec<String> {
    let (open, close) = (format!("<{tag}>"), format!("</{tag}>"));
    let mut values = Vec::new();
    let mut rest = body;
    while let Some(start) = rest.find(&open) {
        let after = &rest[start + open.len()..];
        let Some(end) = after.find(&close) else { break };
        values.push(
            after[..end]
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&apos;", "'")
                .replace("&amp;", "&"),
        );
        rest = &after[end + close.len()..];
    }
    values
}

#[cfg(test)]
mod tests {
    use super::*;

    fn storage(endpoint: Option<&str>, force_path_style: bool) -> S3Storage {
        // reqwest is built with `rustls-no-provider`: every entry point installs the provider before a client exists.
        crate::config::install_crypto_provider();
        S3Storage::new(S3Config {
            bucket: "invitesion-media".into(),
            region: "ap-southeast-1".into(),
            access_key_id: "k".into(),
            secret_access_key: "s".into(),
            session_token: None,
            endpoint: endpoint.map(str::to_string),
            force_path_style,
        })
    }

    #[test]
    fn addressing_matches_the_typescript_driver() {
        let key = "variants/12/0123456789abcdef01234567/standard-640.webp";
        assert_eq!(
            storage(None, false).endpoint_for(key).unwrap(),
            format!("https://invitesion-media.s3.ap-southeast-1.amazonaws.com/{key}")
        );
        assert_eq!(
            storage(Some("http://127.0.0.1:9000/"), true).endpoint_for(key).unwrap(),
            format!("http://127.0.0.1:9000/invitesion-media/{key}")
        );
        assert_eq!(
            storage(Some("https://account.r2.cloudflarestorage.com"), false).endpoint_for(key).unwrap(),
            format!("https://invitesion-media.account.r2.cloudflarestorage.com/{key}")
        );
        assert!(storage(None, false).endpoint_for("../x").is_err());
    }

    #[test]
    fn listings_address_the_bucket_root_like_objects() {
        assert_eq!(
            storage(None, false).bucket_url().unwrap().as_str(),
            "https://invitesion-media.s3.ap-southeast-1.amazonaws.com/"
        );
        assert_eq!(
            storage(Some("http://127.0.0.1:9000/"), true).bucket_url().unwrap().as_str(),
            "http://127.0.0.1:9000/invitesion-media/"
        );
    }

    #[test]
    fn listing_values_are_read_and_entity_decoded() {
        let body = "<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>a&amp;b&lt;c</NextContinuationToken>\
                    <Contents><Key>12/a.jpg</Key></Contents><Contents><Key>12/b.jpg</Key></Contents></ListBucketResult>";
        assert_eq!(xml_values(body, "Key"), ["12/a.jpg", "12/b.jpg"]);
        assert_eq!(xml_values(body, "NextContinuationToken"), ["a&b<c"]);
        assert_eq!(xml_values(body, "IsTruncated"), ["true"]);
        assert!(xml_values("<Key>unterminated", "Key").is_empty());
    }
}
