//! B-019 (G-017, QA-016; I-28): image variants of a host's public upload, made by a job after the upload route has
//! stored the original (09 §8.7). Two WebP ladders: `standard` (fixed widths up to 1920 px) for the page's `srcset`,
//! and `lite` (up to 640 px, lower quality) that the guest page offers instead when the browser sends `Save-Data: on`.
//! The original is never touched: variants live under their own prefix (`variants/<invitation>/<name>/…`) and are listed
//! in `media_variants`, which only this module writes. Without rows (variants missing, deleted, or the flag off) the
//! renderer serves the original. Protected uploads (D-040) and avatars are not variant sources; animated or GIF sources
//! keep their original (a still variant would drop the animation).

use std::io::Cursor;

use image::codecs::webp::WebPDecoder;
use image::imageops::FilterType;
use image::metadata::Orientation;
use image::{DynamicImage, GenericImageView, ImageDecoder, ImageFormat, ImageReader, Limits};
use serde_json::Value;
use sqlx::PgPool;
use time::PrimitiveDateTime;

use crate::jobs::Outcome;
use crate::storage::Storage;

pub const IMAGE_VARIANTS_JOB: &str = "image-variants";

/// The upload route's limit is 5 MB; anything larger did not come through it.
pub const MAX_SOURCE_BYTES: usize = 8 * 1024 * 1024;
/// Decoding limits: a small file can still claim a huge canvas (a decompression bomb).
pub const MAX_SOURCE_SIDE: u32 = 12_000;
pub const MAX_DECODE_ALLOC: u64 = 512 * 1024 * 1024;
/// "Any single image" of the strictest tier (08 §3: basic ≤ 200 KiB). A variant over it is encoded again at a lower
/// quality; one still over it at the tier's floor is not written, so no page is ever offered a variant above the budget.
pub const MAX_VARIANT_BYTES: usize = 200 * 1024;
const QUALITY_STEP: f32 = 8.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Tier {
    Standard,
    Lite,
}

impl Tier {
    pub const ALL: [Tier; 2] = [Tier::Standard, Tier::Lite];

    pub fn as_str(self) -> &'static str {
        match self {
            Tier::Standard => "standard",
            Tier::Lite => "lite",
        }
    }

    /// The ladder; a variant is never wider than its source, and the largest one is capped at the last width.
    pub fn widths(self) -> &'static [u32] {
        match self {
            Tier::Standard => &[320, 480, 640, 960, 1280, 1920],
            Tier::Lite => &[320, 480, 640],
        }
    }

    /// libwebp quality (0–100).
    pub fn quality(self) -> f32 {
        match self {
            Tier::Standard => 74.0,
            Tier::Lite => 46.0,
        }
    }

    /// The lowest quality the byte ceiling may lower a variant to before the variant is left out.
    pub fn quality_floor(self) -> f32 {
        match self {
            Tier::Standard => 42.0,
            Tier::Lite => 30.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlannedVariant {
    pub tier: Tier,
    pub width: u32,
    pub height: u32,
}

/// The variants for a source of `width × height` (after its EXIF orientation): per tier, every ladder width below
/// 90 % of the source's capped width, then the capped width itself. Never an upscale; heights keep the aspect ratio.
pub fn plan(width: u32, height: u32) -> Vec<PlannedVariant> {
    if width == 0 || height == 0 {
        return Vec::new();
    }
    let mut planned = Vec::new();
    for tier in Tier::ALL {
        let ladder = tier.widths();
        let top = width.min(*ladder.last().expect("a ladder has widths"));
        let below = ladder.iter().copied().filter(|&w| u64::from(w) * 10 < u64::from(top) * 9);
        for w in below.chain(std::iter::once(top)) {
            let h = ((u64::from(height) * u64::from(w) + u64::from(width) / 2) / u64::from(width)).max(1);
            planned.push(PlannedVariant { tier, width: w, height: u32::try_from(h).unwrap_or(u32::MAX) });
        }
    }
    planned
}

/// The invitation a variant source belongs to: exactly the keys `invitationMediaKey` writes (`<id>/<24 hex>.<ext>`,
/// the extensions the upload route stores), as `isUploadedMediaPath` accepts them without `/media/`. Never a protected
/// key, an avatar or anything else.
pub fn source_invitation(key: &str) -> Option<i32> {
    let (id, name) = key.split_once('/')?;
    let (stem, ext) = name.split_once('.')?;
    let id_ok = id == "0"
        || (!id.is_empty() && id.len() <= 15 && !id.starts_with('0') && id.bytes().all(|b| b.is_ascii_digit()));
    let stem_ok = stem.len() == 24 && stem.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'));
    if !id_ok || !stem_ok || !matches!(ext, "png" | "jpg" | "webp" | "gif") {
        return None;
    }
    id.parse::<i64>().ok().and_then(|id| i32::try_from(id).ok())
}

/// `variants/<invitation>/<24 hex>/<tier>-<width>.webp`, beside nothing the original's key names.
pub fn variant_key(source_key: &str, tier: Tier, width: u32) -> Option<String> {
    let invitation = source_invitation(source_key)?;
    let stem = source_key.split_once('/')?.1.split_once('.')?.0;
    Some(format!("variants/{invitation}/{stem}/{}-{width}.webp", tier.as_str()))
}

#[derive(Debug, Clone)]
pub struct Encoded {
    pub tier: Tier,
    pub width: u32,
    pub height: u32,
    /// The quality it was encoded at: the tier's, or lower when the byte ceiling required it.
    pub quality: f32,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Default)]
pub struct Rendered {
    pub variants: Vec<Encoded>,
    /// Planned variants left out because they stayed above `MAX_VARIANT_BYTES` at the tier's floor.
    pub over_budget: Vec<PlannedVariant>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum TransformError {
    /// Kept as the original only (GIF, animated WebP): not a failure.
    #[error("not a variant source: {0}")]
    NotASource(&'static str),
    #[error("undecodable image: {0}")]
    Decode(String),
    #[error("webp encoding failed")]
    Encode,
}

fn decode(source: &[u8]) -> Result<DynamicImage, TransformError> {
    let format = image::guess_format(source).map_err(|_| TransformError::Decode("unknown format".into()))?;
    match format {
        ImageFormat::Jpeg | ImageFormat::Png => {}
        ImageFormat::WebP => {
            let animated = WebPDecoder::new(Cursor::new(source))
                .map(|d| d.has_animation())
                .map_err(|e| TransformError::Decode(e.to_string()))?;
            if animated {
                return Err(TransformError::NotASource("animated webp"));
            }
        }
        ImageFormat::Gif => return Err(TransformError::NotASource("gif")),
        _ => return Err(TransformError::Decode("format not stored by the upload route".into())),
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_SOURCE_SIDE);
    limits.max_image_height = Some(MAX_SOURCE_SIDE);
    limits.max_alloc = Some(MAX_DECODE_ALLOC);
    let mut reader = ImageReader::with_format(Cursor::new(source), format);
    reader.limits(limits);
    let mut decoder = reader.into_decoder().map_err(|e| TransformError::Decode(e.to_string()))?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let mut image = DynamicImage::from_decoder(decoder).map_err(|e| TransformError::Decode(e.to_string()))?;
    // Phones store portrait photos sideways with an EXIF orientation that browsers honour on the original; a variant
    // carries no metadata, so the rotation is applied to its pixels.
    image.apply_orientation(orientation);
    Ok(image)
}

fn encode_webp(image: &DynamicImage, quality: f32) -> Result<Vec<u8>, TransformError> {
    let (width, height) = image.dimensions();
    let encoded = if image.color().has_alpha() {
        let rgba = image.to_rgba8();
        webp::Encoder::from_rgba(rgba.as_raw(), width, height).encode_simple(false, quality)
    } else {
        let rgb = image.to_rgb8();
        webp::Encoder::from_rgb(rgb.as_raw(), width, height).encode_simple(false, quality)
    };
    encoded.map(|memory| memory.to_vec()).map_err(|_| TransformError::Encode)
}

/// The tier's quality, lowered by `QUALITY_STEP` while the result is above `MAX_VARIANT_BYTES`; `None` when even the
/// tier's floor is above it.
fn encode_within_budget(image: &DynamicImage, tier: Tier) -> Result<Option<(f32, Vec<u8>)>, TransformError> {
    let mut quality = tier.quality();
    loop {
        let bytes = encode_webp(image, quality)?;
        if bytes.len() <= MAX_VARIANT_BYTES {
            return Ok(Some((quality, bytes)));
        }
        if quality <= tier.quality_floor() {
            return Ok(None);
        }
        quality = (quality - QUALITY_STEP).max(tier.quality_floor());
    }
}

/// Decodes the source once and encodes every planned variant within the byte ceiling. Each tier is resized from one
/// Lanczos3 reduction to its largest width (cheaper than reducing the full source for every width, and
/// indistinguishable at these steps).
pub fn render_variants(source: &[u8]) -> Result<Rendered, TransformError> {
    let image = decode(source)?;
    let (width, height) = image.dimensions();
    let planned = plan(width, height);
    let mut rendered = Rendered { variants: Vec::with_capacity(planned.len()), over_budget: Vec::new() };
    for tier in Tier::ALL {
        let steps: Vec<PlannedVariant> = planned.iter().copied().filter(|p| p.tier == tier).collect();
        let Some(top) = steps.iter().copied().max_by_key(|p| p.width) else { continue };
        let base = if top.width == width {
            image.clone()
        } else {
            image.resize_exact(top.width, top.height, FilterType::Lanczos3)
        };
        for step in steps {
            let resized = if step.width == top.width {
                base.clone()
            } else {
                base.resize_exact(step.width, step.height, FilterType::Lanczos3)
            };
            match encode_within_budget(&resized, tier)? {
                Some((quality, bytes)) => {
                    rendered.variants.push(Encoded { tier, width: step.width, height: step.height, quality, bytes })
                }
                None => rendered.over_budget.push(step),
            }
        }
    }
    Ok(rendered)
}

/// The `image-variants` job: payload `{ "key": "<invitation>/<24 hex>.<ext>" }`. Idempotent: a rerun rewrites the same
/// objects and upserts the same rows.
pub async fn run_image_variants(pool: &PgPool, storage: &Storage, payload: &Value, now: PrimitiveDateTime) -> Outcome {
    let Some(key) = payload.get("key").and_then(Value::as_str) else {
        return Outcome::GiveUp("payload has no key".into());
    };
    let Some(invitation_id) = source_invitation(key) else {
        return Outcome::GiveUp(format!("not a public invitation upload: {key}"));
    };
    // B-031: a deleted invitation's uploads are about to be purged; nothing to render for it.
    match sqlx::query_scalar!(
        r#"select deleted_at is not null as "deleted!" from invitations where id = $1"#,
        invitation_id
    )
    .fetch_optional(pool)
    .await
    {
        Ok(Some(true)) => {
            tracing::info!(key, "invitation deleted; variants not made");
            return Outcome::Done;
        }
        Ok(_) => {}
        Err(error) => return Outcome::Retry(format!("invitation read failed: {key}: {error}")),
    }
    let source = match storage.get(key).await {
        Ok(Some(bytes)) => bytes,
        Ok(None) => return Outcome::Retry(format!("source missing: {key}")),
        Err(error) => return Outcome::Retry(format!("source read failed: {key}: {error}")),
    };
    if source.len() > MAX_SOURCE_BYTES {
        return Outcome::GiveUp(format!("source over {MAX_SOURCE_BYTES} bytes: {key}"));
    }

    let rendered = match tokio::task::spawn_blocking(move || render_variants(&source)).await {
        Ok(Ok(rendered)) => rendered,
        Ok(Err(TransformError::NotASource(reason))) => {
            tracing::info!(key, reason, "original kept without variants");
            return Outcome::Done;
        }
        Ok(Err(error)) => return Outcome::GiveUp(format!("{error}: {key}")),
        Err(error) => return Outcome::Retry(format!("variant task failed: {error}")),
    };

    for left_out in &rendered.over_budget {
        tracing::info!(
            key,
            tier = left_out.tier.as_str(),
            width = left_out.width,
            "variant above the byte ceiling at the tier's floor; not offered"
        );
    }
    let mut rows = Vec::with_capacity(rendered.variants.len());
    for variant in rendered.variants {
        let Some(variant_key) = variant_key(key, variant.tier, variant.width) else {
            return Outcome::GiveUp(format!("no variant key for {key}"));
        };
        let bytes = i32::try_from(variant.bytes.len()).unwrap_or(i32::MAX);
        if let Err(error) = storage.put(&variant_key, variant.bytes, "image/webp").await {
            return Outcome::Retry(format!("variant write failed: {variant_key}: {error}"));
        }
        rows.push((variant_key, variant.tier, variant.width, variant.height, bytes));
    }

    match record_variants(pool, invitation_id, key, &rows, now).await {
        Ok(Recorded::Written) => Outcome::Done,
        // B-031: deleted while this job rendered. The purge may already have listed the invitation's prefixes, so the
        // objects written above are removed here rather than left behind.
        Ok(Recorded::InvitationDeleted) => {
            for (variant_key, ..) in &rows {
                if let Err(error) = storage.delete(variant_key).await {
                    return Outcome::Retry(format!("variant cleanup failed: {variant_key}: {error}"));
                }
            }
            tracing::info!(key, "invitation deleted meanwhile; variants removed");
            Outcome::Done
        }
        // The invitation was deleted after the upload: nothing to serve the variants to.
        Err(error) if error.as_database_error().and_then(|e| e.code()).as_deref() == Some("23503") => {
            tracing::info!(key, "invitation gone; variants not recorded");
            Outcome::Done
        }
        Err(error) => Outcome::Retry(format!("variant rows failed: {key}: {error}")),
    }
}

enum Recorded {
    Written,
    InvitationDeleted,
}

/// Upserts this run's variants and removes any row of the source this run did not write (a variant an earlier run made
/// that the ceiling now leaves out), so the listed set is exactly the latest run's. Objects are never deleted here.
/// B-031: the invitation row is share-locked first, so this either lands before the owner's deletion (whose purge then
/// finds the rows and objects) or sees the deletion and writes nothing.
async fn record_variants(
    pool: &PgPool,
    invitation_id: i32,
    source_key: &str,
    rows: &[(String, Tier, u32, u32, i32)],
    now: PrimitiveDateTime,
) -> Result<Recorded, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let deleted = sqlx::query_scalar!(
        r#"select deleted_at is not null as "deleted!" from invitations where id = $1 for share"#,
        invitation_id
    )
    .fetch_optional(&mut *tx)
    .await?;
    if deleted == Some(true) {
        return Ok(Recorded::InvitationDeleted);
    }
    let written: Vec<String> = rows.iter().map(|(variant_key, ..)| variant_key.clone()).collect();
    sqlx::query!(
        "delete from media_variants where source_key = $1 and not (variant_key = any($2::text[]))",
        source_key,
        &written
    )
    .execute(&mut *tx)
    .await?;
    for (variant_key, tier, width, height, bytes) in rows {
        sqlx::query!(
            "insert into media_variants (invitation_id, source_key, variant_key, format, tier, width, height, bytes, created_at) \
             values ($1, $2, $3, 'webp', $4, $5, $6, $7, $8) \
             on conflict (source_key, tier, format, width) do update set variant_key = excluded.variant_key, \
             height = excluded.height, bytes = excluded.bytes, created_at = excluded.created_at",
            invitation_id,
            source_key,
            variant_key,
            tier.as_str(),
            i32::try_from(*width).unwrap_or(i32::MAX),
            i32::try_from(*height).unwrap_or(i32::MAX),
            bytes,
            now
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(Recorded::Written)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageEncoder, Rgb, RgbImage, Rgba, RgbaImage};

    fn widths(planned: &[PlannedVariant], tier: Tier) -> Vec<(u32, u32)> {
        planned.iter().filter(|p| p.tier == tier).map(|p| (p.width, p.height)).collect()
    }

    #[test]
    fn the_planner_never_upscales_and_caps_each_ladder() {
        let phone = plan(4032, 3024);
        assert_eq!(
            widths(&phone, Tier::Standard),
            [(320, 240), (480, 360), (640, 480), (960, 720), (1280, 960), (1920, 1440)]
        );
        assert_eq!(widths(&phone, Tier::Lite), [(320, 240), (480, 360), (640, 480)]);
        // 960 is within 10 % of a 1000 px source, so the ladder stops at 640 and adds the source width.
        assert_eq!(widths(&plan(1000, 500), Tier::Standard), [(320, 160), (480, 240), (640, 320), (1000, 500)]);
        assert_eq!(widths(&plan(200, 300), Tier::Standard), [(200, 300)]);
        assert_eq!(widths(&plan(200, 300), Tier::Lite), [(200, 300)]);
        assert_eq!(widths(&plan(3000, 1), Tier::Standard).first(), Some(&(320, 1)));
        assert!(plan(0, 10).is_empty());
    }

    #[test]
    fn only_public_invitation_uploads_are_sources() {
        assert_eq!(source_invitation("12/0123456789abcdef01234567.jpg"), Some(12));
        assert_eq!(source_invitation("0/0123456789abcdef01234567.png"), Some(0));
        for key in [
            "protected/12/0123456789abcdef01234567.jpg",
            "avatars/12/0123456789abcdef01234567.jpg",
            "012/0123456789abcdef01234567.jpg",
            "12/0123456789ABCDEF01234567.jpg",
            "12/0123456789abcdef0123456.jpg",
            "12/0123456789abcdef01234567.svg",
            "12/0123456789abcdef01234567.jpg.webp",
            "99999999999/0123456789abcdef01234567.jpg",
            "12/sub/0123456789abcdef01234567.jpg",
            "variants/12/0123456789abcdef01234567/standard-320.webp",
        ] {
            assert_eq!(source_invitation(key), None, "{key}");
        }
        assert_eq!(
            variant_key("12/0123456789abcdef01234567.jpg", Tier::Lite, 480).as_deref(),
            Some("variants/12/0123456789abcdef01234567/lite-480.webp")
        );
    }

    fn png(image: &DynamicImage) -> Vec<u8> {
        let mut out = Vec::new();
        image.write_to(&mut Cursor::new(&mut out), ImageFormat::Png).unwrap();
        out
    }

    fn jpeg_with_orientation(width: u32, height: u32, orientation: u8) -> Vec<u8> {
        let image =
            RgbImage::from_fn(
                width,
                height,
                |x, _| if x < width / 2 { Rgb([200, 40, 40]) } else { Rgb([40, 40, 200]) },
            );
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 90)
            .write_image(image.as_raw(), width, height, image::ExtendedColorType::Rgb8)
            .unwrap();
        // APP1 "Exif" with a big-endian TIFF header and one IFD entry: Orientation (0x0112), SHORT, 1, value.
        let tiff: Vec<u8> =
            [&b"MM\0*\0\0\0\x08"[..], &[0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0], &[0, 0, 0, 0]]
                .concat();
        let payload: Vec<u8> = [&b"Exif\0\0"[..], &tiff].concat();
        let length = u16::try_from(payload.len() + 2).unwrap().to_be_bytes();
        [&jpeg[..2], &[0xFF, 0xE1], &length, &payload, &jpeg[2..]].concat()
    }

    #[test]
    fn variants_are_webp_at_the_planned_sizes_with_alpha_kept() {
        let source = DynamicImage::ImageRgba8(RgbaImage::from_fn(1000, 500, |x, y| {
            Rgba([(x % 256) as u8, (y % 256) as u8, 90, if x < 500 { 255 } else { 0 }])
        }));
        let rendered = render_variants(&png(&source)).unwrap();
        assert!(rendered.over_budget.is_empty());
        let sizes: Vec<(Tier, u32, u32)> = rendered.variants.iter().map(|v| (v.tier, v.width, v.height)).collect();
        let expected: Vec<(Tier, u32, u32)> = plan(1000, 500).iter().map(|p| (p.tier, p.width, p.height)).collect();
        assert_eq!(sizes, expected);
        for variant in &rendered.variants {
            assert!(variant.bytes.len() <= MAX_VARIANT_BYTES);
            assert_eq!(variant.quality, variant.tier.quality(), "a smooth image needs no lower quality");
            assert_eq!(image::guess_format(&variant.bytes).unwrap(), ImageFormat::WebP);
            let decoded = image::load_from_memory(&variant.bytes).unwrap();
            assert_eq!(decoded.dimensions(), (variant.width, variant.height));
            assert!(
                decoded.color().has_alpha(),
                "transparent PNG keeps its alpha in {}-{}",
                variant.tier.as_str(),
                variant.width
            );
        }
    }

    #[test]
    fn no_variant_above_the_byte_ceiling_is_ever_written() {
        // Uniform noise is the worst case for any encoder: its large variants stay above the ceiling even at the floor.
        let mut state = 0x2545_F491_4F6C_DD1D_u64;
        let noise = RgbImage::from_fn(1280, 960, |_, _| {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            let [r, g, b, ..] = state.to_le_bytes();
            Rgb([r, g, b])
        });
        let rendered = render_variants(&png(&DynamicImage::ImageRgb8(noise))).unwrap();
        assert!(
            rendered.over_budget.iter().any(|p| p.tier == Tier::Standard && p.width == 1280),
            "1280 px of noise cannot fit"
        );
        for variant in &rendered.variants {
            assert!(
                variant.bytes.len() <= MAX_VARIANT_BYTES,
                "{}-{}: {} bytes",
                variant.tier.as_str(),
                variant.width,
                variant.bytes.len()
            );
            assert!(variant.quality >= variant.tier.quality_floor() && variant.quality <= variant.tier.quality());
        }
        for left_out in &rendered.over_budget {
            assert!(!rendered.variants.iter().any(|v| v.tier == left_out.tier && v.width == left_out.width));
        }
        assert_eq!(rendered.variants.len() + rendered.over_budget.len(), plan(1280, 960).len());
    }

    #[test]
    fn exif_orientation_is_applied_to_the_pixels() {
        let rendered = render_variants(&jpeg_with_orientation(800, 400, 6)).unwrap().variants;
        let top = rendered.iter().filter(|v| v.tier == Tier::Standard).max_by_key(|v| v.width).unwrap();
        assert_eq!((top.width, top.height), (400, 800), "a sideways phone photo becomes portrait");
        let upright = render_variants(&jpeg_with_orientation(800, 400, 1)).unwrap().variants;
        let top = upright.iter().filter(|v| v.tier == Tier::Standard).max_by_key(|v| v.width).unwrap();
        assert_eq!((top.width, top.height), (800, 400));
    }

    #[test]
    fn gifs_garbage_and_bombs_are_refused_before_any_variant() {
        let gif = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;";
        assert_eq!(render_variants(gif).unwrap_err(), TransformError::NotASource("gif"));
        assert!(matches!(render_variants(b"not an image at all").unwrap_err(), TransformError::Decode(_)));
        let mut truncated = png(&DynamicImage::ImageRgb8(RgbImage::new(64, 64)));
        truncated.truncate(60);
        assert!(matches!(render_variants(&truncated).unwrap_err(), TransformError::Decode(_)));
        // A valid PNG header (CRC recomputed) claiming 20000 × 20000 is refused by the limits before a canvas exists.
        let mut bomb = png(&DynamicImage::ImageRgb8(RgbImage::new(1, 1)));
        bomb[16..20].copy_from_slice(&20_000u32.to_be_bytes());
        bomb[20..24].copy_from_slice(&20_000u32.to_be_bytes());
        let crc = crc32(&bomb[12..29]).to_be_bytes();
        bomb[29..33].copy_from_slice(&crc);
        match render_variants(&bomb).unwrap_err() {
            TransformError::Decode(message) => assert!(message.to_lowercase().contains("limit"), "{message}"),
            other => panic!("expected a limits refusal, got {other:?}"),
        }
    }

    fn crc32(data: &[u8]) -> u32 {
        let mut crc = 0xFFFF_FFFFu32;
        for &byte in data {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                crc = (crc >> 1) ^ (0xEDB8_8320 & (crc & 1).wrapping_neg());
            }
        }
        !crc
    }
}
