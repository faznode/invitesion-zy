//! B-019 (G-017, QA-016; I-28) on a real database migrated by drizzle-kit (`TEST_DATABASE_URL`) and both storage
//! drivers: the shared source vector (`contracts/vectors/image-variants.json`, also run by
//! `tests/b019-image-variants.test.ts`) and the planner's vectors; then the image-variant job end to end, enqueued the way
//! the upload route does (`lib/media/variant-jobs.ts`): a 5 MB-class phone photo through the local driver with every
//! variant within the byte ceiling and the original untouched, idempotent reruns, a GIF kept as its original, an
//! undecodable file given up, a missing source retried and then finished, an invitation deleted meanwhile, leases with
//! `for update skip locked`, and the S3 driver against a stand-in endpoint that verifies every SigV4 signature. Fixture
//! rows are fictional and tagged per run; the objects live in a temporary directory removed at the end.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, Method, StatusCode, Uri};
use axum::response::IntoResponse;
use axum::routing::any;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{
    DynamicImage, ExtendedColorType, GenericImageView, ImageEncoder, ImageFormat, Rgb, RgbImage, Rgba, RgbaImage,
};
use invitesion_api::config::install_crypto_provider;
use invitesion_api::jobs::{LEASE, Outcome, backoff, claim_due, run_due};
use invitesion_api::media::{self, IMAGE_VARIANTS_JOB, MAX_VARIANT_BYTES, Tier, plan, source_invitation, variant_key};
use invitesion_api::storage::sigv4::{SignInput, sha256_hex, sign_request};
use invitesion_api::storage::{LocalStorage, S3Config, S3Storage, Storage};
use invitesion_api::views::utc_now;
use serde_json::{Value, json};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use time::{Date, Duration, Month, OffsetDateTime, PrimitiveDateTime, Time};

/// The upload route's limit (`MAX_BYTES` in `app/api/invitations/[id]/upload/route.ts`).
const UPLOAD_LIMIT: usize = 5 * 1024 * 1024;

#[test]
fn the_shared_vectors_hold_in_rust() {
    let vectors: Value = serde_json::from_str(include_str!("../../../contracts/vectors/image-variants.json")).unwrap();
    let sources = vectors["sources"].as_array().unwrap();
    assert!(sources.len() >= 10);
    for source in sources {
        let key = source["key"].as_str().unwrap();
        let expected = source["invitationId"].as_i64().map(|id| i32::try_from(id).unwrap());
        assert_eq!(source_invitation(key), expected, "{key}");
        assert_eq!(
            variant_key(key, Tier::Lite, 320).is_some(),
            expected.is_some(),
            "only a source has variant keys: {key}"
        );
    }
    let pair = |value: &Value| [value[0].as_u64().unwrap() as u32, value[1].as_u64().unwrap() as u32];
    let plans = vectors["plans"].as_array().unwrap();
    assert!(plans.len() >= 5);
    for case in plans {
        let [width, height] = pair(&case["source"]);
        let planned = plan(width, height);
        for tier in Tier::ALL {
            let got: Vec<[u32; 2]> = planned.iter().filter(|p| p.tier == tier).map(|p| [p.width, p.height]).collect();
            let want: Vec<[u32; 2]> = case[tier.as_str()].as_array().unwrap().iter().map(pair).collect();
            assert_eq!(got, want, "{width} × {height}, {}", tier.as_str());
        }
    }
}

/// Deterministic xorshift, so the fixture photo is the same bytes on every run.
struct Noise(u64);

impl Noise {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn field(&mut self, width: u32, height: u32) -> DynamicImage {
        DynamicImage::ImageRgb8(RgbImage::from_fn(width, height, |_, _| {
            let [r, g, b, ..] = self.next().to_le_bytes();
            Rgb([r, g, b])
        }))
    }
}

/// A 4032 × 3024 "phone photo" (12 MP) saved as a JPEG of 4–5 MB, at the upload route's limit: smooth colour structure
/// at three scales plus per-pixel grain, the mix that makes real photographs expensive to encode. It is not a photograph,
/// and real photos vary, which is why the job enforces the byte ceiling per variant rather than trusting one quality.
fn phone_photo() -> Vec<u8> {
    const WIDTH: u32 = 4032;
    const HEIGHT: u32 = 3024;
    let mut noise = Noise(0x9E37_79B9_7F4A_7C15);
    let mut layer = |divisor: u32| {
        noise.field(WIDTH / divisor, HEIGHT / divisor).resize_exact(WIDTH, HEIGHT, FilterType::Triangle).into_rgb8()
    };
    let (coarse, middle, fine) = (layer(96), layer(24), layer(6));
    let mut grain = Noise(0xD1B5_4A32_D192_ED03);
    let photo = RgbImage::from_fn(WIDTH, HEIGHT, |x, y| {
        let (c, m, f) = (coarse.get_pixel(x, y), middle.get_pixel(x, y), fine.get_pixel(x, y));
        let speck = (grain.next() % 25) as i32 - 12;
        Rgb(std::array::from_fn(|ch| {
            ((i32::from(c[ch]) * 50 + i32::from(m[ch]) * 30 + i32::from(f[ch]) * 20) / 100 + speck).clamp(0, 255) as u8
        }))
    });
    let mut jpeg = Vec::new();
    // Fixed bytes: quality 90 gave 5.7 MB, above the route's limit; 87 lands inside it.
    JpegEncoder::new_with_quality(&mut jpeg, 87)
        .write_image(photo.as_raw(), WIDTH, HEIGHT, ExtendedColorType::Rgb8)
        .unwrap();
    jpeg
}

fn encoded(image: &DynamicImage, format: ImageFormat) -> Vec<u8> {
    let mut out = Vec::new();
    image.write_to(&mut std::io::Cursor::new(&mut out), format).unwrap();
    out
}

fn small_jpeg(seed: u64) -> Vec<u8> {
    let image = Noise(seed).field(30, 20).resize_exact(1200, 800, FilterType::Triangle);
    encoded(&DynamicImage::ImageRgb8(image.into_rgb8()), ImageFormat::Jpeg)
}

fn sha256(bytes: &[u8]) -> String {
    sha256_hex(bytes)
}

/// attempts, max_attempts, done_at, locked_until, last_error, run_at
type JobRow = (i32, i32, Option<PrimitiveDateTime>, Option<PrimitiveDateTime>, Option<String>, PrimitiveDateTime);
/// id, invitation_id, variant_key, format, tier, width, height, bytes
type VariantRow = (i32, i32, String, String, String, i32, i32, i32);

struct Fixture {
    pool: PgPool,
    user: i32,
    invitation: i32,
    doomed: i32,
    tag: String,
    root: PathBuf,
}

impl Fixture {
    async fn create() -> Self {
        let url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must name a database migrated by drizzle-kit");
        let pool = PgPoolOptions::new().max_connections(8).connect(&url).await.expect("connect");
        let tag = uuid::Uuid::new_v4().simple().to_string();
        let user: i32 = sqlx::query_scalar("insert into users (email, clerk_user_id) values ($1, $2) returning id")
            .bind(format!("b019-test-{tag}@example.invalid"))
            .bind(format!("user_b019_test_{tag}"))
            .fetch_one(&pool)
            .await
            .expect("fixture user");
        let mut ids = Vec::new();
        for name in ["kept", "doomed"] {
            let id: i32 = sqlx::query_scalar(
                "insert into invitations (user_id, slug, event_type) values ($1, $2, 'wedding') returning id",
            )
            .bind(user)
            .bind(format!("b019-{name}-{tag}"))
            .fetch_one(&pool)
            .await
            .expect("fixture invitation");
            ids.push(id);
        }
        let root = std::env::temp_dir().join(format!("invitesion-b019-{tag}"));
        std::fs::create_dir_all(&root).unwrap();
        Self { pool, user, invitation: ids[0], doomed: ids[1], tag, root }
    }

    /// `<invitation>/<24 hex>.<ext>`, the shape `invitationMediaKey` writes, unique per run.
    fn key(&self, invitation: i32, n: u8, ext: &str) -> String {
        format!("{invitation}/{}{n:02x}.{ext}", &self.tag[..22])
    }

    fn write(&self, key: &str, bytes: &[u8]) {
        let path = self.root.join(key);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    /// What `enqueueImageVariants` inserts: one job per source, deduplicated on the key, due now in UTC wall time.
    async fn enqueue(&self, key: &str, at: PrimitiveDateTime) -> Option<i64> {
        sqlx::query_scalar(
            "insert into jobs (kind, payload, dedupe_key, run_at) values ($1, $2, $3, $4) \
             on conflict (kind, dedupe_key) do nothing returning id",
        )
        .bind(IMAGE_VARIANTS_JOB)
        .bind(json!({ "key": key }))
        .bind(key)
        .bind(at)
        .fetch_optional(&self.pool)
        .await
        .expect("enqueue")
    }

    async fn job(&self, id: i64) -> JobRow {
        sqlx::query_as(
            "select attempts, max_attempts, done_at, locked_until, last_error, run_at from jobs where id = $1",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .expect("job row")
    }

    async fn variants(&self, source_key: &str) -> Vec<VariantRow> {
        sqlx::query_as(
            "select id, invitation_id, variant_key, format, tier, width, height, bytes from media_variants \
             where source_key = $1 order by tier desc, width",
        )
        .bind(source_key)
        .fetch_all(&self.pool)
        .await
        .expect("variant rows")
    }

    /// Due jobs that are not this run's: when there are none, the run summaries can be asserted exactly.
    async fn foreign_due(&self, ours: &[i64], at: PrimitiveDateTime) -> i64 {
        sqlx::query_scalar(
            "select count(*) from jobs where done_at is null and attempts < max_attempts and run_at <= $1 \
             and (locked_until is null or locked_until <= $1) and not (id = any($2))",
        )
        .bind(at)
        .bind(ours)
        .fetch_one(&self.pool)
        .await
        .unwrap()
    }

    async fn remove(&self, keys: &[String]) {
        sqlx::query("delete from jobs where kind = $1 and dedupe_key = any($2)")
            .bind(IMAGE_VARIANTS_JOB)
            .bind(keys)
            .execute(&self.pool)
            .await
            .unwrap();
        // media_variants rows go with their invitation (on delete cascade).
        sqlx::query("delete from invitations where user_id = $1").bind(self.user).execute(&self.pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(self.user).execute(&self.pool).await.unwrap();
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn files_under(root: &Path) -> Vec<String> {
    let mut found = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else {
                found.push(path.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/"));
            }
        }
    }
    found.sort();
    found
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_variant_job_on_a_real_database_and_both_drivers() {
    install_crypto_provider();
    let f = Fixture::create().await;
    let local = Storage::Local(LocalStorage::new(&f.root));
    // Postgres keeps microseconds; a whole-microsecond clock lets stored times be compared exactly.
    let clock = utc_now();
    let now = clock.replace_nanosecond(clock.nanosecond() / 1_000 * 1_000).unwrap();

    // ── Sources, stored as the upload route stores them.
    let started = Instant::now();
    let photo = phone_photo();
    println!("fixture photo: {} bytes, made in {:.1} s", photo.len(), started.elapsed().as_secs_f64());
    assert!(photo.len() > 4 * 1024 * 1024 && photo.len() <= UPLOAD_LIMIT, "a 5 MB-class upload: {} bytes", photo.len());
    let transparent = DynamicImage::ImageRgba8(RgbaImage::from_fn(900, 600, |x, y| {
        Rgba([(x % 256) as u8, (y % 256) as u8, 120, if x < 450 { 255 } else { 0 }])
    }));
    let gif = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;";
    let (photo_key, png_key, gif_key, garbage_key, late_key, doomed_key) = (
        f.key(f.invitation, 1, "jpg"),
        f.key(f.invitation, 2, "png"),
        f.key(f.invitation, 3, "gif"),
        f.key(f.invitation, 4, "jpg"),
        f.key(f.invitation, 5, "jpg"),
        f.key(f.doomed, 6, "jpg"),
    );
    f.write(&photo_key, &photo);
    f.write(&png_key, &encoded(&transparent, ImageFormat::Png));
    f.write(&gif_key, gif);
    f.write(&garbage_key, b"\xff\xd8\xff\xe0 this is no JPEG");
    f.write(&doomed_key, &small_jpeg(7));
    // `late_key` has a job but no object yet: the upload's object store lagging behind its job.

    let mut ours = Vec::new();
    for key in [&photo_key, &png_key, &gif_key, &garbage_key, &late_key, &doomed_key] {
        ours.push(f.enqueue(key, now).await.expect("a new job"));
    }
    assert_eq!(f.enqueue(&photo_key, now).await, None, "one job per source: the dedupe key holds");
    let [photo_job, png_job, gif_job, garbage_job, late_job, doomed_job] = ours[..] else { unreachable!() };
    // The invitation is deleted after its upload was queued.
    sqlx::query("delete from invitations where id = $1").bind(f.doomed).execute(&f.pool).await.unwrap();

    // ── One pass of the runner.
    let exact = f.foreign_due(&ours, now).await == 0;
    let started = Instant::now();
    let summary = run_due(&f.pool, &local, now, 50).await.expect("run");
    println!("first pass: {summary:?} in {:.1} s", started.elapsed().as_secs_f64());
    if exact {
        assert_eq!((summary.claimed, summary.done, summary.retried, summary.gave_up), (6, 4, 1, 1));
    }

    // The photo: every planned variant within the ceiling, decodable at its recorded size, listed once.
    let (attempts, _, done, locked, error, _) = f.job(photo_job).await;
    assert_eq!((attempts, done.is_some(), locked, error), (1, true, None, None));
    let rows = f.variants(&photo_key).await;
    let planned: Vec<(String, i32, i32)> =
        plan(4032, 3024).iter().map(|p| (p.tier.as_str().to_string(), p.width as i32, p.height as i32)).collect();
    let listed: Vec<(String, i32, i32)> = rows.iter().map(|r| (r.4.clone(), r.5, r.6)).collect();
    assert_eq!(listed, planned, "a 5 MB photo keeps all {} planned variants within the ceiling", planned.len());
    let mut report = Vec::new();
    for (_, invitation, key, format, tier, width, height, bytes) in &rows {
        assert_eq!((*invitation, format.as_str()), (f.invitation, "webp"));
        assert_eq!(
            key,
            &variant_key(&photo_key, if tier == "lite" { Tier::Lite } else { Tier::Standard }, *width as u32).unwrap()
        );
        let object = std::fs::read(f.root.join(key)).expect("variant object written");
        assert_eq!(object.len() as i32, *bytes, "{key}: recorded bytes");
        assert!(object.len() <= MAX_VARIANT_BYTES, "{key}: {} bytes above the ceiling", object.len());
        assert_eq!(image::guess_format(&object).unwrap(), ImageFormat::WebP);
        assert_eq!(image::load_from_memory(&object).unwrap().dimensions(), (*width as u32, *height as u32));
        report.push(format!("{tier}-{width}: {:.1} KiB", object.len() as f64 / 1024.0));
    }
    println!("photo variants: {}", report.join(", "));
    assert_eq!(sha256(&std::fs::read(f.root.join(&photo_key)).unwrap()), sha256(&photo), "the original is untouched");

    // The transparent PNG keeps its alpha; the GIF keeps only its original; the garbage is given up; the late source is
    // retried after the backoff; the deleted invitation's job finishes without rows.
    let png_rows = f.variants(&png_key).await;
    assert_eq!(png_rows.len(), plan(900, 600).len());
    let largest = png_rows.iter().max_by_key(|r| r.5).unwrap();
    assert!(image::load_from_memory(&std::fs::read(f.root.join(&largest.2)).unwrap()).unwrap().color().has_alpha());
    assert!(f.job(png_job).await.2.is_some());
    let (_, _, gif_done, _, gif_error, _) = f.job(gif_job).await;
    assert!(gif_done.is_some() && gif_error.is_none());
    assert!(f.variants(&gif_key).await.is_empty());
    let (attempts, max_attempts, done, locked, error, _) = f.job(garbage_job).await;
    assert_eq!((attempts, done, locked), (max_attempts, None, None), "given up: never claimed again");
    assert!(error.as_deref().unwrap_or_default().starts_with("undecodable image"), "{error:?}");
    assert!(f.variants(&garbage_key).await.is_empty());
    let (attempts, _, done, locked, error, run_at) = f.job(late_job).await;
    assert_eq!((attempts, done, locked, run_at), (1, None, None, now + backoff(1)));
    assert!(error.as_deref().unwrap_or_default().starts_with("source missing"), "{error:?}");
    let (_, _, doomed_done, _, _, _) = f.job(doomed_job).await;
    assert!(doomed_done.is_some());
    assert!(f.variants(&doomed_key).await.is_empty());
    // Variants only under their own prefix; nothing written beside the originals.
    let invitation_dir = format!("{}/", f.invitation);
    let beside: Vec<String> = files_under(&f.root).into_iter().filter(|p| p.starts_with(&invitation_dir)).collect();
    assert_eq!(beside, {
        let mut originals = vec![photo_key.clone(), png_key.clone(), gif_key.clone(), garbage_key.clone()];
        originals.sort();
        originals
    });

    // ── Reruns are idempotent; the listed set is exactly the latest run's.
    let again = run_due(&f.pool, &local, now, 50).await.expect("second pass");
    if f.foreign_due(&ours, now).await == 0 && exact {
        assert_eq!(again.claimed, 0, "nothing of ours is due: done, given up, or waiting for its retry");
    }
    let ids_before: Vec<i32> = rows.iter().map(|r| r.0).collect();
    sqlx::query(
        "insert into media_variants (invitation_id, source_key, variant_key, format, tier, width, height, bytes) \
         values ($1, $2, $3, 'webp', 'standard', 9999, 9999, 1)",
    )
    .bind(f.invitation)
    .bind(&photo_key)
    .bind(format!("variants/{}/{}01/standard-9999.webp", f.invitation, &f.tag[..22]))
    .execute(&f.pool)
    .await
    .unwrap();
    let later = now + Duration::minutes(1);
    assert_eq!(media::run_image_variants(&f.pool, &local, &json!({ "key": photo_key }), later).await, Outcome::Done);
    let rerun = f.variants(&photo_key).await;
    assert_eq!(
        rerun.iter().map(|r| r.0).collect::<Vec<_>>(),
        ids_before,
        "the same rows, upserted; the stale one removed"
    );
    assert_eq!(rerun.iter().map(|r| (r.4.clone(), r.5, r.6)).collect::<Vec<_>>(), planned);
    assert_eq!(
        media::run_image_variants(
            &f.pool,
            &local,
            &json!({ "key": "protected/1/0123456789abcdef01234567.jpg" }),
            later
        )
        .await,
        Outcome::GiveUp("not a public invitation upload: protected/1/0123456789abcdef01234567.jpg".into())
    );
    assert!(matches!(
        media::run_image_variants(&f.pool, &local, &json!({ "url": photo_key }), later).await,
        Outcome::GiveUp(_)
    ));

    // ── The late source arrives; the retry after its backoff finishes it.
    f.write(&late_key, &small_jpeg(11));
    let retry_at = now + backoff(1) + Duration::seconds(1);
    run_due(&f.pool, &local, retry_at, 50).await.expect("retry pass");
    let (attempts, _, done, _, error, _) = f.job(late_job).await;
    assert_eq!((attempts, done.is_some(), error), (2, true, None));
    assert_eq!(f.variants(&late_key).await.len(), plan(1200, 800).len());

    // ── Leases: concurrent runners never take the same job; a lease that expires frees the job again.
    let mut leased = Vec::new();
    for n in 0..6u8 {
        let key = f.key(f.invitation, 0x20 + n, "jpg");
        leased.push(f.enqueue(&key, now).await.unwrap());
        ours.push(*leased.last().unwrap());
    }
    let (a, b) = tokio::join!(claim_due(&f.pool, now, 4), claim_due(&f.pool, now, 4));
    let (a, b) = (a.unwrap(), b.unwrap());
    let mut taken: Vec<i64> = a.iter().chain(b.iter()).map(|j| j.id).filter(|id| leased.contains(id)).collect();
    let claimed_total = taken.len();
    taken.sort();
    taken.dedup();
    assert_eq!(taken.len(), claimed_total, "no job claimed twice");
    if f.foreign_due(&ours, now).await == 0 && exact {
        assert_eq!(taken, leased, "together they took all six");
    }
    let during: Vec<i64> = claim_due(&f.pool, now + LEASE - Duration::seconds(1), 50)
        .await
        .unwrap()
        .into_iter()
        .map(|j| j.id)
        .filter(|id| taken.contains(id))
        .collect();
    assert!(during.is_empty(), "leased jobs are not taken while the lease holds");
    let expired: Vec<_> = claim_due(&f.pool, now + LEASE + Duration::seconds(1), 50)
        .await
        .unwrap()
        .into_iter()
        .filter(|j| taken.contains(&j.id))
        .collect();
    assert_eq!(expired.len(), taken.len(), "an expired lease frees the job");
    assert!(expired.iter().all(|j| j.attempts == 2 && j.kind == IMAGE_VARIANTS_JOB));

    // ── The S3 driver against a stand-in endpoint that checks every signature.
    let endpoint = StandIn::start().await;
    let s3 = |secret: &str| {
        Storage::S3(S3Storage::new(S3Config {
            bucket: "invitesion-media".into(),
            region: "ap-southeast-1".into(),
            access_key_id: "AKIDEXAMPLE".into(),
            secret_access_key: secret.into(),
            session_token: None,
            endpoint: Some(endpoint.base.clone()),
            force_path_style: true,
        }))
    };
    let remote = s3(STAND_IN_SECRET);
    let remote_key = f.key(f.invitation, 0x30, "jpg");
    let remote_photo = small_jpeg(13);
    remote.put(&remote_key, remote_photo.clone(), "image/jpeg").await.expect("S3 put");
    assert_eq!(remote.get(&remote_key).await.expect("S3 get").as_deref(), Some(remote_photo.as_slice()));
    assert_eq!(
        remote.get(&f.key(f.invitation, 0x31, "jpg")).await.expect("S3 miss"),
        None,
        "a missing object is a miss"
    );
    assert_eq!(media::run_image_variants(&f.pool, &remote, &json!({ "key": remote_key }), later).await, Outcome::Done);
    let remote_rows = f.variants(&remote_key).await;
    assert_eq!(remote_rows.len(), plan(1200, 800).len());
    {
        let objects = endpoint.objects.lock().unwrap();
        for row in &remote_rows {
            let (content_type, body) =
                objects.get(&format!("invitesion-media/{}", row.2)).expect("variant stored remotely");
            assert_eq!((content_type.as_str(), body.len() as i32), ("image/webp", row.7));
            assert_eq!(image::guess_format(body).unwrap(), ImageFormat::WebP);
        }
    }
    assert!(endpoint.refusals.lock().unwrap().is_empty(), "every request carried a valid signature");
    // Negative control: the stand-in really verifies signatures.
    assert!(s3("not-the-secret").get(&remote_key).await.is_err());
    assert_eq!(endpoint.refusals.lock().unwrap().len(), 1);

    let mut keys = vec![photo_key, png_key, gif_key, garbage_key, late_key, doomed_key, remote_key];
    keys.extend((0..6u8).map(|n| f.key(f.invitation, 0x20 + n, "jpg")));
    f.remove(&keys).await;
    let left: i64 = sqlx::query_scalar("select count(*) from jobs where dedupe_key = any($1)")
        .bind(&keys)
        .fetch_one(&f.pool)
        .await
        .unwrap();
    assert_eq!(left, 0, "fixture jobs removed");
}

const STAND_IN_SECRET: &str = "fictional-secret-for-the-stand-in";

/// A path-style S3 stand-in: PUT and GET of single objects, each request's SigV4 signature recomputed from what arrived
/// over HTTP (method, path, signed headers, payload hash, which must match the body) and refused with 403 on mismatch.
struct StandIn {
    base: String,
    objects: Objects,
    refusals: Refusals,
}

/// `bucket/key` → (content type, bytes).
type Objects = Arc<Mutex<HashMap<String, (String, Vec<u8>)>>>;
type Refusals = Arc<Mutex<Vec<String>>>;

#[derive(Clone)]
struct StandInState {
    base: String,
    objects: Objects,
    refusals: Refusals,
}

impl StandIn {
    async fn start() -> Self {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let objects = Arc::new(Mutex::new(HashMap::new()));
        let refusals = Arc::new(Mutex::new(Vec::new()));
        let state = StandInState { base: base.clone(), objects: objects.clone(), refusals: refusals.clone() };
        let app = Router::new().route("/{*path}", any(stand_in)).with_state(state);
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        Self { base, objects, refusals }
    }
}

fn amz_instant(value: &str) -> Option<OffsetDateTime> {
    let digits = |range: std::ops::Range<usize>| value.get(range)?.parse::<u32>().ok();
    let date =
        Date::from_calendar_date(digits(0..4)? as i32, Month::try_from(digits(4..6)? as u8).ok()?, digits(6..8)? as u8)
            .ok()?;
    let time = Time::from_hms(digits(9..11)? as u8, digits(11..13)? as u8, digits(13..15)? as u8).ok()?;
    Some(PrimitiveDateTime::new(date, time).assume_utc())
}

fn verify(state: &StandInState, method: &Method, uri: &Uri, headers: &HeaderMap, body: &[u8]) -> Result<(), String> {
    let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok()).map(str::to_string);
    let authorization = header("authorization").ok_or("no authorization")?;
    let signed =
        authorization.split("SignedHeaders=").nth(1).and_then(|r| r.split(',').next()).ok_or("no signed headers")?;
    let payload_hash = header("x-amz-content-sha256").ok_or("no payload hash")?;
    if payload_hash != sha256_hex(body) {
        return Err("payload hash does not match the body".into());
    }
    let date = header("x-amz-date").and_then(|d| amz_instant(&d)).ok_or("bad x-amz-date")?;
    let values: Vec<(String, String)> = signed
        .split(';')
        .filter(|name| !matches!(*name, "host" | "x-amz-date"))
        .map(|name| Ok((name.to_string(), header(name).ok_or(format!("signed header {name} missing"))?)))
        .collect::<Result<_, String>>()?;
    let pairs: Vec<(&str, &str)> = values.iter().map(|(n, v)| (n.as_str(), v.as_str())).collect();
    let url = format!("{}{}", state.base, uri.path());
    let expected = sign_request(&SignInput {
        method: method.as_str(),
        url: &url,
        region: "ap-southeast-1",
        service: "s3",
        access_key_id: "AKIDEXAMPLE",
        secret_access_key: STAND_IN_SECRET,
        session_token: None,
        payload_hash: &payload_hash,
        headers: &pairs,
        date,
    })
    .map_err(|e| e.to_string())?;
    let expected = expected.iter().find(|(n, _)| n == "authorization").map(|(_, v)| v.clone()).unwrap_or_default();
    if expected != authorization { Err(format!("signature mismatch for {method} {}", uri.path())) } else { Ok(()) }
}

async fn stand_in(
    State(state): State<StandInState>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> axum::response::Response {
    if let Err(reason) = verify(&state, &method, &uri, &headers, &body) {
        state.refusals.lock().unwrap().push(reason);
        return StatusCode::FORBIDDEN.into_response();
    }
    let path = uri.path().trim_start_matches('/').to_string();
    match method {
        Method::PUT => {
            let content_type =
                headers.get("content-type").and_then(|v| v.to_str().ok()).unwrap_or_default().to_string();
            state.objects.lock().unwrap().insert(path, (content_type, body.to_vec()));
            StatusCode::OK.into_response()
        }
        Method::GET => match state.objects.lock().unwrap().get(&path) {
            Some((_, bytes)) => bytes.clone().into_response(),
            None => StatusCode::NOT_FOUND.into_response(),
        },
        _ => StatusCode::METHOD_NOT_ALLOWED.into_response(),
    }
}
