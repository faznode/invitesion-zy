import type { ThemeArtPoolKey } from './theme-art';

/**
 * G-016: self-hosted theme art that replaces the runtime Unsplash hotlinks of `theme-art.ts`, one mood pool at a time.
 *
 * Origin: every asset is original. Each was generated for this repository with the v0 image tool on 2026-11-10 from a
 * text prompt alone (no input image, no reference photograph, no third-party material; the prompt is kept per entry),
 * reviewed as a contact sheet, cropped to its reviewed box (`crop`, which drops the bars the generator left around a
 * portrait composition), cut to the catalog card's 4:5 and written as WebP by the session 43 derivation script (session
 * 44 reconstructed it from this record and added the budget step in `THEME_ART_PROVENANCE.derivation`).
 * Licence basis: the one the harness samples already record for generated art (`own-work`, provenance `generated`,
 * author Invitesion, no attribution required). The 1024 px originals are not kept in the repository; `sourceSha256`,
 * the prompt and the crop trace every derivative back to its original.
 *
 * Coverage: session 43 shipped the marble, gold and night pools (26 of the 64 catalog templates); session 44 the other
 * 16 pools that serve catalog templates (56 originals, the same tool, method and review; one rejected output each for
 * mist-03 and islamic-03 was regenerated and only the kept prompt is recorded), so every catalog template is
 * self-hosted. Three pools serve no catalog template (watercolor, lavender, graduation) and keep their remote photos
 * for a template outside the catalog; `REMOTE_THEME_ART_POOLS` names that boundary. Template-owned art, never invitation
 * content (ADR-O01): host uploads and the protected `/media/` path are separate.
 *
 * Rollback: drop a pool's entries (or empty the array). `buildThemeArtRegistry([])` reproduces the pre-G-016 output
 * exactly, which `tests/g016-theme-art.test.ts` pins with a fingerprint of all 64 templates.
 */

export type ThemeArtFile = {
  /** Public path under `public/`, served same-origin. */
  path: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  /** The WebP quality when a file had to step below the default 78 to fit its budget (session 44); absent = 78. */
  quality?: number;
};

export type ThemeArtAsset = {
  id: string;
  pool: ThemeArtPoolKey;
  /** The generator prompt, verbatim. */
  prompt: string;
  /** SHA-256 of the generated original (1024 × 1024 PNG). */
  sourceSha256: string;
  /** The reviewed box `[left, top, right, bottom]` in the original, before the 4:5 cut. */
  crop: readonly [number, number, number, number];
  /** `cover` for the preview background, `card` for the catalog card, `gallery` for the preview gallery. */
  files: { cover: ThemeArtFile; card: ThemeArtFile; gallery: ThemeArtFile };
};

export const THEME_ART_PROVENANCE = {
  license: 'own-work',
  provenance: 'generated',
  author: 'Invitesion',
  attribution: 'none required',
  generator: 'v0 image tool, text prompt only (no input image)',
  created: '2026-11-10',
  derivation:
    'crop to the reviewed box, centred 4:5 cut, Lanczos resize, WebP quality 78 method 6 (Pillow); a file above its budget steps down by 4 to the first quality within it, floor 60, recorded as `quality`',
  review: 'Agent self-review (ADR-O09) as contact sheets and on the catalog card; owner review pending',
} as const;

/** Widths of the derivatives (height = width × 5 / 4); a crop narrower than a width keeps its own width. */
export const THEME_ART_WIDTHS = { cover: 960, card: 480, gallery: 720 } as const;

export const THEME_ART_REGISTER = [
  {
    id: "gold-01",
    pool: "gold",
    prompt: "Draped champagne-gold silk fabric with soft flowing folds, warm studio light, elegant close-up textile photograph with calm smooth areas, portrait orientation. No objects, no people, no text, no logos.",
    sourceSha256: "c0f3ef36713c8bc1d6e15442662aa6b9e283289cddc863c5c163dd855d6e5eb1",
    crop: [183, 0, 841, 1024],
    files: {
      cover: { path: "/theme-art/gold-01-cover.webp", width: 658, height: 822, bytes: 21798, sha256: "aaa9a6c4f514d631fb13f3dd2d798012545f820870431dc848764226ac2c06cc" },
      card: { path: "/theme-art/gold-01-card.webp", width: 480, height: 600, bytes: 12704, sha256: "03784968152a1aff046f6e45dd3866cad845c6670d047e1466b2fdb21e9c31d6" },
      gallery: { path: "/theme-art/gold-01-cover.webp", width: 658, height: 822, bytes: 21798, sha256: "aaa9a6c4f514d631fb13f3dd2d798012545f820870431dc848764226ac2c06cc" },
    },
  },
  {
    id: "gold-02",
    pool: "gold",
    prompt: "Brushed gold leaf panel with a subtle embossed fan and sunburst geometric pattern in the corners, warm low-key lighting, luxurious but quiet, calm center, portrait orientation, close-up texture photograph. No objects, no people, no text, no logos.",
    sourceSha256: "b95ed3098ace7014386c1ce1876d1ed0f63784d51a12aacb130413611bcc1cf3",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/gold-02-cover.webp", width: 819, height: 1023, bytes: 43212, sha256: "37e57d743ef8bde460d3d518fb158dc1d54cd11384f1df64fe3506acbbcb6487" },
      card: { path: "/theme-art/gold-02-card.webp", width: 480, height: 600, bytes: 18026, sha256: "be0eae79e8a8c180ec1b0e42502cc2e65ff92b8bf9298b1de92a59acbc59bfa0" },
      gallery: { path: "/theme-art/gold-02-gallery.webp", width: 720, height: 900, bytes: 34910, sha256: "94aff340aa9e95d25974cc735d917ad4292b839bfddba872446355fc6fc0952c" },
    },
  },
  {
    id: "gold-03",
    pool: "gold",
    prompt: "Softly crumpled warm gold foil texture with gentle glints, shallow depth of field so most of it is a smooth soft blur, abstract close-up, portrait orientation. No objects, no people, no text, no logos.",
    sourceSha256: "5790bcb9e2f1e1f9ab02059b06c6bc6b5f35d0600fe92752f4207ff02ee401db",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/gold-03-cover.webp", width: 819, height: 1023, bytes: 19734, sha256: "44489c290bf067faf86ab9b1ac95eb1db3f32ea89bef4e84e5f7504e47a763ee" },
      card: { path: "/theme-art/gold-03-card.webp", width: 480, height: 600, bytes: 10320, sha256: "65bc3e9eb731b02fed57995a633eed83f267dc939ccbaf2b97cdf793455a037c" },
      gallery: { path: "/theme-art/gold-03-gallery.webp", width: 720, height: 900, bytes: 16808, sha256: "29e369bdd0b75987c4d9228f113221af936c4aa20da9c3dae0727216c7d647b6" },
    },
  },
  {
    id: "gold-04",
    pool: "gold",
    prompt: "Deep dark velvet backdrop with a soft scatter of small warm golden bokeh lights drifting across the upper part, elegant evening mood, calm dark lower half, portrait orientation, photograph. No objects, no people, no text, no logos.",
    sourceSha256: "5fddcd4cf2a3c40831929bd110666b75162593616afb70700745135717b7d220",
    crop: [183, 0, 841, 1024],
    files: {
      cover: { path: "/theme-art/gold-04-cover.webp", width: 658, height: 822, bytes: 12478, sha256: "c070274a391edfc671133700e27e714967e96d651a1a33eeb1b57c34b2223c81" },
      card: { path: "/theme-art/gold-04-card.webp", width: 480, height: 600, bytes: 8638, sha256: "1c5d714469686e6e3f94756ac430150e192f41c5286f0219e802faf314dd7119" },
      gallery: { path: "/theme-art/gold-04-cover.webp", width: 658, height: 822, bytes: 12478, sha256: "c070274a391edfc671133700e27e714967e96d651a1a33eeb1b57c34b2223c81" },
    },
  },
  {
    id: "gold-05",
    pool: "gold",
    prompt: "Gold thread embroidery of a simple repeating geometric lattice on deep navy fabric, soft raking side light showing the stitch texture, close-up textile photograph, portrait orientation. No objects, no people, no text, no logos.",
    sourceSha256: "90f5d7d15b64e8eccfbd6b808dd9b9b254ae2155aaff42283644581c8b515755",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/gold-05-cover.webp", width: 819, height: 1023, bytes: 87194, sha256: "97e20f2e3ecd550ead19a91d20e9812d82a9ad669e5530f4f66ed80725146803" },
      card: { path: "/theme-art/gold-05-card.webp", width: 480, height: 600, bytes: 44946, sha256: "db87519d441992b7a79872ef8071c09623e70db1409e4dba437fc74e3aedbc89" },
      gallery: { path: "/theme-art/gold-05-gallery.webp", width: 720, height: 900, bytes: 73744, sha256: "08ded93ddc261f30a1719a78f7d1f34c5f701373b4e84d4e3eb93239b5211894" },
    },
  },
  {
    id: "marble-01",
    pool: "marble",
    prompt: "Close-up photograph of a polished white marble surface with soft grey veins running diagonally from the top left corner, even diffuse daylight, calm and mostly empty center, fine natural stone texture, portrait orientation. No objects, no people, no text, no logos.",
    sourceSha256: "e631789ffca72a5be603722952aa1264a51ce1f7f797818292b1e89b86fd8893",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/marble-01-cover.webp", width: 819, height: 1023, bytes: 9048, sha256: "e9002793b0ff949a79bddb63b227cd3c713d81ba62fbdc61a058fc3f16cf234a" },
      card: { path: "/theme-art/marble-01-card.webp", width: 480, height: 600, bytes: 4102, sha256: "6cf3ad25e185bd4e7934c4a8a131cd8b546caa908b31666e1bab18131e20300f" },
      gallery: { path: "/theme-art/marble-01-gallery.webp", width: 720, height: 900, bytes: 7424, sha256: "389b4c518d6205f9cbd833fe88b891d53eca180b1dc8bba5e70fadeeda5b7fef" },
    },
  },
  {
    id: "marble-02",
    pool: "marble",
    prompt: "White marble slab with fine warm grey and faint gold veining near the edges, soft window light falling from the left, minimal composition with a wide quiet area in the middle, portrait orientation, architectural interior detail photograph. No objects, no people, no text, no logos.",
    sourceSha256: "91062190013dfe3892ae487eeb25fc928d2bef304cac29000ed629175877ee69",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/marble-02-cover.webp", width: 819, height: 1023, bytes: 9686, sha256: "0ffcda8b100db1706294f402e8b292490d246d316eab56f8ce3c1f014eaa7499" },
      card: { path: "/theme-art/marble-02-card.webp", width: 480, height: 600, bytes: 4288, sha256: "25e7dd0239e22856e76c6b529a61a1b39db6e3bb68fdd674ccc58381d6053e81" },
      gallery: { path: "/theme-art/marble-02-gallery.webp", width: 720, height: 900, bytes: 7934, sha256: "e05f3c02d5873541dce168ab31329fdc894cf7e9af7f2f5a81984bc45a9234f5" },
    },
  },
  {
    id: "marble-03",
    pool: "marble",
    prompt: "A smooth white plaster and marble wall with the soft shadow of a rounded arch cast across it by late afternoon sun, minimal architectural photograph, gentle warm and cool tones, large calm empty area, portrait orientation. No people, no furniture, no text, no logos.",
    sourceSha256: "64acdd2eca29c7e50f1b6fc73969ca4f3eed9327d1af3d0a22efb99393917173",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/marble-03-cover.webp", width: 819, height: 1023, bytes: 8206, sha256: "a2061aa9c1d8398ed13dd5d68a89240286315e76200359dd75c8279a52b609c0" },
      card: { path: "/theme-art/marble-03-card.webp", width: 480, height: 600, bytes: 3594, sha256: "82c0eff4e2fa844f14a6cb19ba986e544a94443b7669edf5548eb545ed7c67e9" },
      gallery: { path: "/theme-art/marble-03-gallery.webp", width: 720, height: 900, bytes: 6692, sha256: "560c45c1237ec8a7473ade366f243ba5fd960ca83051a28c39a2f8af485e45b1" },
    },
  },
  {
    id: "marble-04",
    pool: "marble",
    prompt: "Pale beige travertine stone wall with subtle horizontal layers and small natural pores, soft morning light grazing the surface, minimal and calm, portrait orientation, close architectural texture photograph. No people, no objects, no text, no logos.",
    sourceSha256: "d378593aee5d21d3086552702d914184ebff19e09d646e330c049a9138cf587a",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/marble-04-cover.webp", width: 819, height: 1023, bytes: 84426, sha256: "ddfc074571e01374f53f6b6ca413215576b86969823fca2608823716192dfe11" },
      card: { path: "/theme-art/marble-04-card.webp", width: 480, height: 600, bytes: 31296, sha256: "c47a750f4d944080ecca705ebb815473c1b00f49409bed6238513d7aea25a3e9" },
      gallery: { path: "/theme-art/marble-04-gallery.webp", width: 720, height: 900, bytes: 67178, sha256: "f704c218072f6805ab5a53bededac8b9988e3a0142d955bb3dcf6fc6edf28683" },
    },
  },
  {
    id: "marble-05",
    pool: "marble",
    prompt: "Two low white marble steps at the foot of a plain smooth stone wall, soft daylight from above, quiet minimal architectural photograph with a large empty wall area in the upper two thirds, neutral cream and grey tones, portrait orientation. No people, no plants, no text, no logos.",
    sourceSha256: "20f86654a37e36180a2d724055f1d311a77400e8a6ece964399375885815bb2c",
    crop: [183, 0, 841, 1024],
    files: {
      cover: { path: "/theme-art/marble-05-cover.webp", width: 658, height: 822, bytes: 7390, sha256: "ba558f1f8af93c957a1a6def06e1dd5547fee50f2f2a78902666f8b62b518030" },
      card: { path: "/theme-art/marble-05-card.webp", width: 480, height: 600, bytes: 4194, sha256: "ab40d1dde6ed5f5649b7fa028072032b53fbc5791c5e050d4025caf431c0ee62" },
      gallery: { path: "/theme-art/marble-05-cover.webp", width: 658, height: 822, bytes: 7390, sha256: "ba558f1f8af93c957a1a6def06e1dd5547fee50f2f2a78902666f8b62b518030" },
    },
  },
  {
    id: "marble-06",
    pool: "marble",
    prompt: "Macro photograph of smooth white marble with soft blue-grey veins and a faint warm reflection of light, shallow depth of field so the far part softly blurs, calm and elegant, portrait orientation. No objects, no people, no text, no logos.",
    sourceSha256: "16f23fee94ed0dd9010c880f8e2e9f86d2940db0107cab825e55ab8a43bb081a",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/marble-06-cover.webp", width: 819, height: 1023, bytes: 11190, sha256: "8a3f9a67803dff74bbc66f12b254a228db59cd8057d23c45dc8bd7032b79afc7" },
      card: { path: "/theme-art/marble-06-card.webp", width: 480, height: 600, bytes: 5494, sha256: "834d188dee2128e798ba3449de23be2c3df50c615cb1e5eb41893b5ac2b2d206" },
      gallery: { path: "/theme-art/marble-06-gallery.webp", width: 720, height: 900, bytes: 9392, sha256: "f3224e86049f997f5c0d59d7aacd8686d843c971cca5804ffa984481da8ce775" },
    },
  },
  {
    id: "night-01",
    pool: "night",
    prompt: "Full moon low over a calm sea at night, a soft path of moonlight on the water, deep blue sky with faint stars, long exposure, minimal and serene, portrait orientation, landscape photograph. No people, no boats, no buildings, no text, no logos.",
    sourceSha256: "68b56e7162dc4cdde755de6b74b852e046a02a99869c8683f1187ba0584a0f83",
    crop: [212, 0, 812, 965],
    files: {
      cover: { path: "/theme-art/night-01-cover.webp", width: 600, height: 750, bytes: 7372, sha256: "9991a818f6d53254225bcd0bbb460f567e112c0acbad0d332b3ef7f9b44c3bd4" },
      card: { path: "/theme-art/night-01-card.webp", width: 480, height: 600, bytes: 4952, sha256: "3ba3173ee1d881433c30674c48d7848d7fd04a62a3d723649b6347a67adffb1b" },
      gallery: { path: "/theme-art/night-01-cover.webp", width: 600, height: 750, bytes: 7372, sha256: "9991a818f6d53254225bcd0bbb460f567e112c0acbad0d332b3ef7f9b44c3bd4" },
    },
  },
  {
    id: "night-02",
    pool: "night",
    prompt: "Thin crescent moon in a clear deep indigo night sky with softly scattered stars, the dark silhouettes of palm fronds along the bottom edge, quiet and calm, portrait orientation, photograph. No people, no buildings, no text, no logos.",
    sourceSha256: "14e1ce5539c42386105184bdc656f9ea11653ad65eab96f23dc9b3081c948286",
    crop: [183, 0, 841, 1024],
    files: {
      cover: { path: "/theme-art/night-02-cover.webp", width: 658, height: 822, bytes: 25392, sha256: "aac32c32fbbac916e77880480d27234d9ac0ff0fdae442ab82cd36cde9262de6" },
      card: { path: "/theme-art/night-02-card.webp", width: 480, height: 600, bytes: 14306, sha256: "e6c3b47f3ed6506201543cc0be4a31494f3776ce3a111beb1a10afb1c1e7c8d5" },
      gallery: { path: "/theme-art/night-02-cover.webp", width: 658, height: 822, bytes: 25392, sha256: "aac32c32fbbac916e77880480d27234d9ac0ff0fdae442ab82cd36cde9262de6" },
    },
  },
  {
    id: "night-03",
    pool: "night",
    prompt: "Starry night sky over gentle dark rolling hills, a faint soft band of the Milky Way, deep blue and violet-black tones, calm, portrait orientation, astrophotography. No people, no buildings, no roads, no text, no logos.",
    sourceSha256: "ce8f8136645c54abf181abf81d3f2e20cae8f636712d191893bfc8da3efcbb61",
    crop: [183, 0, 841, 1024],
    files: {
      cover: { path: "/theme-art/night-03-cover.webp", width: 658, height: 822, bytes: 44822, sha256: "c2c4386daa3f13b1625e8f62143d5a4f5fe62a3cf36ca9a4d8aa12a8ae504603" },
      card: { path: "/theme-art/night-03-card.webp", width: 480, height: 600, bytes: 22648, sha256: "53754bef5485a557c0ca903c3aec5aca522b7f080b55a5c4df765f15aeb85a4f" },
      gallery: { path: "/theme-art/night-03-cover.webp", width: 658, height: 822, bytes: 44822, sha256: "c2c4386daa3f13b1625e8f62143d5a4f5fe62a3cf36ca9a4d8aa12a8ae504603" },
    },
  },
  {
    id: "floral-01",
    pool: "floral",
    prompt: "Fresh white jasmine blossoms and small green leaves scattered loosely across a pale mint linen tablecloth, soft diffuse morning light, delicate and airy with a wide calm empty area, overhead still-life photograph, portrait orientation. No people, no text, no logos.",
    sourceSha256: "94e58228c71a7c09b67b30b895a146cee0ec1aab1b76f19eef3e239332027872",
    crop: [0, 48, 1024, 960],
    files: {
      cover: { path: "/theme-art/floral-01-cover.webp", width: 729, height: 911, bytes: 43346, sha256: "1faafbce5393291c1bcba06efd2857ddb830c9d03eed2277176524795a820b1d" },
      card: { path: "/theme-art/floral-01-card.webp", width: 480, height: 600, bytes: 21678, sha256: "79f62f501848f0a56bb7827b0a637998f05ff4b42b57d7df3afa2d6022512c62" },
      gallery: { path: "/theme-art/floral-01-gallery.webp", width: 720, height: 900, bytes: 40570, sha256: "6b3a794b1c058f39f133cbd13ff1172ddff3399b1ddfd91f42c855106c0fec9d" },
    },
  },
  {
    id: "floral-02",
    pool: "floral",
    prompt: "A loose bridal bouquet of white roses, jasmine and baby's breath resting on a soft cream silk cloth, gentle window light, shallow depth of field, calm plain background with generous empty space, portrait orientation, still-life photograph. No people, no hands, no text, no logos.",
    sourceSha256: "36082a7ed523948908fa78cb3d02ea9ac1849a936c0f3f9acab25c3132fe2fd2",
    crop: [129, 0, 895, 1024],
    files: {
      cover: { path: "/theme-art/floral-02-cover.webp", width: 766, height: 957, bytes: 42840, sha256: "ae6ec461d72acf09d1269f346c71362f27a332610d81e03039a70f2a1194cafd" },
      card: { path: "/theme-art/floral-02-card.webp", width: 480, height: 600, bytes: 24242, sha256: "f00035d28a8adc771ed55865d470680d13fd84ea4abf36428cce61f7e2493cf7" },
      gallery: { path: "/theme-art/floral-02-gallery.webp", width: 720, height: 900, bytes: 39690, sha256: "24cd9e54fd38dbd8420c2a53975d105fe97a1a8567cec509a8cd37ed52000d6e" },
    },
  },
  {
    id: "floral-03",
    pool: "floral",
    prompt: "Close-up of white gardenia and jasmine flowers with tiny dewdrops against a softly blurred pale green background, natural daylight, serene and fresh, portrait orientation, macro photograph. No people, no text, no logos.",
    sourceSha256: "95c18dd65d13683518d490d6d8ae6491c26dff8b8fbe6ab7320abac70cc3c8aa",
    crop: [170, 0, 854, 1024],
    files: {
      cover: { path: "/theme-art/floral-03-cover.webp", width: 684, height: 855, bytes: 33724, sha256: "8980c8595b07a522ef65c6a6c13d030b98538aea499e8ca4a312f06a1436a632" },
      card: { path: "/theme-art/floral-03-card.webp", width: 480, height: 600, bytes: 21982, sha256: "8ae04f89482833611a9ecdf9d6bd2db0aed6c04d9e341613c6dca6f481cb4c29" },
      gallery: { path: "/theme-art/floral-03-cover.webp", width: 684, height: 855, bytes: 33724, sha256: "8980c8595b07a522ef65c6a6c13d030b98538aea499e8ca4a312f06a1436a632" },
    },
  },
  {
    id: "peony-01",
    pool: "peony",
    prompt: "Soft pink peonies in full bloom with ruffled petals gathered along the lower edge of the frame against a plain blush pink wall, gentle diffuse light, romantic and calm with a large empty area above, portrait orientation, still-life photograph. No people, no text, no logos.",
    sourceSha256: "dfa46d16d825e56285ecd13d004498f3d41b58476ff7af67a40d1c396b3751c8",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/peony-01-cover.webp", width: 819, height: 1023, bytes: 48956, sha256: "5e72e25858f713c152d1bf9420a79b8e69fdce087772897b8ca5cede3b6bab40" },
      card: { path: "/theme-art/peony-01-card.webp", width: 480, height: 600, bytes: 24208, sha256: "64590d5917ea7014058b0caa53773bde8e7afebc3b340cfadcb775f8f315af3c" },
      gallery: { path: "/theme-art/peony-01-gallery.webp", width: 720, height: 900, bytes: 40952, sha256: "d7594ac8f8b38f793bb40d669e85de171f871c0dc67b83a99f9b99886d8ee130" },
    },
  },
  {
    id: "peony-02",
    pool: "peony",
    prompt: "Macro photograph of a pale pink peony's layered petals with soft-focus edges, warm rose-gold light, dreamy and tender, portrait orientation. No people, no text, no logos.",
    sourceSha256: "228eee17ab16d22ba3f0048be9b0960ee6bd8556f58b8f6163a128410a81b9c0",
    crop: [183, 18, 841, 1006],
    files: {
      cover: { path: "/theme-art/peony-02-cover.webp", width: 658, height: 822, bytes: 21750, sha256: "5bcff301853aa377a414bd0cfb5c93354d6abf6750e1cbc232673bceae501dfc" },
      card: { path: "/theme-art/peony-02-card.webp", width: 480, height: 600, bytes: 15144, sha256: "73cbd073f768d1ff467f306ba52e53051547b2a72b66431d72426f57bc6ae638" },
      gallery: { path: "/theme-art/peony-02-cover.webp", width: 658, height: 822, bytes: 21750, sha256: "5bcff301853aa377a414bd0cfb5c93354d6abf6750e1cbc232673bceae501dfc" },
    },
  },
  {
    id: "peony-03",
    pool: "peony",
    prompt: "Scattered blush and rose-gold peony petals on a soft ivory satin surface, gentle shadows, airy and romantic with calm open areas, overhead photograph, portrait orientation. No people, no text, no logos.",
    sourceSha256: "071d76c396fa1551b6bd42ec0caa64cdac56e98c169239e2adea59090e85e5f8",
    crop: [183, 28, 841, 996],
    files: {
      cover: { path: "/theme-art/peony-03-cover.webp", width: 658, height: 822, bytes: 25688, sha256: "874733c263226fb2579036bdfe3ce71a99a07f93e8965ddeefe5581f548228e5" },
      card: { path: "/theme-art/peony-03-card.webp", width: 480, height: 600, bytes: 17550, sha256: "7404673c10639964fe21701ffc6571d7e409c734c91489c1afbafa8c034f5fa2" },
      gallery: { path: "/theme-art/peony-03-cover.webp", width: 658, height: 822, bytes: 25688, sha256: "874733c263226fb2579036bdfe3ce71a99a07f93e8965ddeefe5581f548228e5" },
    },
  },
  {
    id: "rose-01",
    pool: "rose",
    prompt: "Deep red roses with velvety petals emerging from deep shadow, dark moody still life, low-key warm light, luxurious and dramatic with a large dark calm area, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "bc6aca434bdfc5ce021ea4792aa18dc5821896711037700047941814c03d27fa",
    crop: [183, 25, 841, 999],
    files: {
      cover: { path: "/theme-art/rose-01-cover.webp", width: 658, height: 822, bytes: 26896, sha256: "74de0d2a4bddafc170c3cb7e4d8e6542fafe2682f1019cc3a32c8d9ed37c809f" },
      card: { path: "/theme-art/rose-01-card.webp", width: 480, height: 600, bytes: 18022, sha256: "2a1fe6d9e0350663954522772bfb7a89f72f7f0a6aacedc0cc90e0423b21c66f" },
      gallery: { path: "/theme-art/rose-01-cover.webp", width: 658, height: 822, bytes: 26896, sha256: "74de0d2a4bddafc170c3cb7e4d8e6542fafe2682f1019cc3a32c8d9ed37c809f" },
    },
  },
  {
    id: "rose-02",
    pool: "rose",
    prompt: "A single dark crimson rose lying on black velvet, soft rim light tracing the petals, minimal and dramatic with wide dark empty space, portrait orientation, still-life photograph. No people, no text, no logos.",
    sourceSha256: "4926f5c641daf2b98d8ea60c6e3cd6a9756d3e9131fddfb716a28ad32034a2e1",
    crop: [180, 19, 844, 1005],
    files: {
      cover: { path: "/theme-art/rose-02-cover.webp", width: 664, height: 830, bytes: 17126, sha256: "ec5f2a33285814f514a52d77798769a7b8cb5e339504688007b47614a486cdf1" },
      card: { path: "/theme-art/rose-02-card.webp", width: 480, height: 600, bytes: 10548, sha256: "4df8f348a039a5f8a0e1f1cab8aecbb58c73d795ea6543dfa911b935a8aae53f" },
      gallery: { path: "/theme-art/rose-02-cover.webp", width: 664, height: 830, bytes: 17126, sha256: "ec5f2a33285814f514a52d77798769a7b8cb5e339504688007b47614a486cdf1" },
    },
  },
  {
    id: "rose-03",
    pool: "rose",
    prompt: "A cluster of burgundy and dusty pink garden roses with dark green leaves against a deep emerald background, painterly chiaroscuro lighting, rich and elegant, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "ba3288464b286fb1af42b01d4c8a528ed2a9d98cb6e8f77e10c4792935c6e70a",
    crop: [172, 0, 853, 1024],
    files: {
      cover: { path: "/theme-art/rose-03-cover.webp", width: 681, height: 851, bytes: 42690, sha256: "0b1fa8728ce41232aa5554133e23ad881d0fca08237c7b73a741c160f010b2df" },
      card: { path: "/theme-art/rose-03-card.webp", width: 480, height: 600, bytes: 27306, sha256: "27eec89d8a7d21da78cc53707e168e9de6cb274dd1171e1b3c9872d4575fdb3f" },
      gallery: { path: "/theme-art/rose-03-cover.webp", width: 681, height: 851, bytes: 42690, sha256: "0b1fa8728ce41232aa5554133e23ad881d0fca08237c7b73a741c160f010b2df" },
    },
  },
  {
    id: "rose-04",
    pool: "rose",
    prompt: "Close-up of soft lavender and silver-grey roses with dewdrops, muted cool tones, gentle side light, elegant and calm, shallow depth of field, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "b2a3d8a8f565f881a322745bfaff80a890a6844508843b7f8b5cd6971f8eb204",
    crop: [170, 0, 854, 1024],
    files: {
      cover: { path: "/theme-art/rose-04-cover.webp", width: 684, height: 855, bytes: 43982, sha256: "988cbb7d65b4a33b2ed2fd7b732bd56b9863e766f9b233e076c2a47fd78b782f" },
      card: { path: "/theme-art/rose-04-card.webp", width: 480, height: 600, bytes: 27954, sha256: "6076fa16417b56af428f78f08174d0b3be44457b19d81012ea4be691d269163a" },
      gallery: { path: "/theme-art/rose-04-cover.webp", width: 684, height: 855, bytes: 43982, sha256: "988cbb7d65b4a33b2ed2fd7b732bd56b9863e766f9b233e076c2a47fd78b782f" },
    },
  },
  {
    id: "sakura-01",
    pool: "sakura",
    prompt: "Branches of pale pink cherry blossoms against a soft dusky blue evening sky, gentle light, airy and delicate with an open calm sky area, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "630c345bb1346795d261250cdec3bce433db48a93a3a640e6856743f6360bb41",
    crop: [170, 0, 841, 1000],
    files: {
      cover: { path: "/theme-art/sakura-01-cover.webp", width: 671, height: 838, bytes: 23622, sha256: "63a04099951504045fd714ec64af3f8c2c6ec9692521438cfa09225af5c65a94" },
      card: { path: "/theme-art/sakura-01-card.webp", width: 480, height: 600, bytes: 16410, sha256: "2fa93186a69af4066e4df63a8872a5bd2a2db58fe5b18f893ca94cdefab8e6a3" },
      gallery: { path: "/theme-art/sakura-01-cover.webp", width: 671, height: 838, bytes: 23622, sha256: "63a04099951504045fd714ec64af3f8c2c6ec9692521438cfa09225af5c65a94" },
    },
  },
  {
    id: "sakura-02",
    pool: "sakura",
    prompt: "Close-up of cherry blossom flowers in soft pink with a dreamy blurred pastel blue background, shallow depth of field, tender spring mood, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "90f892e87bc6f1d62c585e97dd9efaaf1b6ab6eaba214f7e71cec6c79e7a4e00",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/sakura-02-cover.webp", width: 819, height: 1023, bytes: 23562, sha256: "daa6cd3e6f4b374c533ab69b18660d114563deb39b092d02910e9232b2ab5cc3" },
      card: { path: "/theme-art/sakura-02-card.webp", width: 480, height: 600, bytes: 12004, sha256: "54121829066b8b786a0c42c4401cebb5a61915a1986ba3497cc541f1732140f3" },
      gallery: { path: "/theme-art/sakura-02-gallery.webp", width: 720, height: 900, bytes: 19980, sha256: "bd313fa999964851565b14b30c51d5a1ca6f0c3956fd4deb43f9618fd26adc0f" },
    },
  },
  {
    id: "sakura-03",
    pool: "sakura",
    prompt: "Fallen pink cherry blossom petals floating on calm pale blue water, soft light, peaceful and minimal with open calm water, overhead photograph, portrait orientation. No people, no text, no logos.",
    sourceSha256: "0c7d02583df2919bf5d864ffa366905c2d9a12cf07b79eaf70938cf3f644c9ff",
    crop: [170, 25, 854, 999],
    files: {
      cover: { path: "/theme-art/sakura-03-cover.webp", width: 684, height: 855, bytes: 29050, sha256: "4c72409f968f35874181a4a31b5e5d5310c6daa69d509aedee616bb4aac9782d" },
      card: { path: "/theme-art/sakura-03-card.webp", width: 480, height: 600, bytes: 18866, sha256: "6b7973ddfe2749cedd5d443fdf7934b42ffb532a5fe0ea7d892ed6d7dfccf06a" },
      gallery: { path: "/theme-art/sakura-03-cover.webp", width: 684, height: 855, bytes: 29050, sha256: "4c72409f968f35874181a4a31b5e5d5310c6daa69d509aedee616bb4aac9782d" },
    },
  },
  {
    id: "eucalyptus-01",
    pool: "eucalyptus",
    prompt: "Sprigs of silver dollar eucalyptus laid diagonally across a pale sage linen surface, soft overcast daylight, minimal and fresh with generous empty space, overhead still-life photograph, portrait orientation. No people, no text, no logos.",
    sourceSha256: "e497258312e9be5832dbdb79347281647e56de29ec64ba4d8611ee300b3c803e",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/eucalyptus-01-cover.webp", width: 819, height: 1023, bytes: 95212, sha256: "1fa1a059f59deeecbb195ef217f54a4f0fd3bdd4849a22f8bebde92ca57a6807" },
      card: { path: "/theme-art/eucalyptus-01-card.webp", width: 480, height: 600, bytes: 21222, sha256: "0e6ae90fe82f9cdbbf9580bb2bd95d2827e8167aa24bb4508b933e7ac7d05e8e" },
      gallery: { path: "/theme-art/eucalyptus-01-gallery.webp", width: 720, height: 900, bytes: 65064, sha256: "d6f01447a245aee9432bb83df1c884836f3a22bd569a98cb296ec974e0aecbd7" },
    },
  },
  {
    id: "eucalyptus-02",
    pool: "eucalyptus",
    prompt: "A few eucalyptus stems in a plain clear glass bottle casting a soft shadow on a warm off-white plaster wall, natural afternoon light, calm and minimal with a large empty wall area, portrait orientation, still-life photograph. No people, no text, no logos.",
    sourceSha256: "52486e6115ed7aaf36f840e9129d3921fdec88531c45666a0d3862dc75a42916",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/eucalyptus-02-cover.webp", width: 819, height: 1023, bytes: 22070, sha256: "daf9fccf55398a9d9ce44c150a44cdcbfd131cf271944c1f77f6e68bd7c749c5" },
      card: { path: "/theme-art/eucalyptus-02-card.webp", width: 480, height: 600, bytes: 8412, sha256: "68fc7c543f5c799a2da96a6bd7ed0cc89882224e988a55ad3c06802a23e498bf" },
      gallery: { path: "/theme-art/eucalyptus-02-gallery.webp", width: 720, height: 900, bytes: 17126, sha256: "6935aace909548dfb2a7115feb0641342b0f06da3223813769212e4e6211ddf6" },
    },
  },
  {
    id: "eucalyptus-03",
    pool: "eucalyptus",
    prompt: "Trailing green ivy vines climbing an old pale stone wall, soft diffuse light, lush but quiet with deep emerald tones, portrait orientation, photograph. No people, no windows, no text, no logos.",
    sourceSha256: "c234626afb1a0b78ba5d5af26fc9c41e2369c836421404016b2fcdf6ec3401a2",
    crop: [170, 0, 852, 1024],
    files: {
      cover: { path: "/theme-art/eucalyptus-03-cover.webp", width: 682, height: 852, bytes: 85592, sha256: "c0de57fbec31c643f6b0621bc2521350d64a764057867b376e608da4baf18a0c" },
      card: { path: "/theme-art/eucalyptus-03-card.webp", width: 480, height: 600, bytes: 48264, sha256: "f6bbb8fba60019d1cfdce189038f283e7943e45ad169853e82bf585fbaffc6d1", quality: 74 },
      gallery: { path: "/theme-art/eucalyptus-03-cover.webp", width: 682, height: 852, bytes: 85592, sha256: "c0de57fbec31c643f6b0621bc2521350d64a764057867b376e608da4baf18a0c" },
    },
  },
  {
    id: "eucalyptus-04",
    pool: "eucalyptus",
    prompt: "Dried and fresh eucalyptus with small olive branches on a terracotta-toned linen cloth, warm soft light, relaxed and natural with calm open areas, overhead still-life photograph, portrait orientation. No people, no text, no logos.",
    sourceSha256: "7ded965edc8d5a63fbddafa54756792c97e40ef77d752e6c98fb7fb97caaf3c2",
    crop: [0, 48, 1024, 1024],
    files: {
      cover: { path: "/theme-art/eucalyptus-04-cover.webp", width: 780, height: 975, bytes: 90576, sha256: "84e142559034674f54194d6c31b414fba4eb47f222c48e546b2f9f26c46eb823" },
      card: { path: "/theme-art/eucalyptus-04-card.webp", width: 480, height: 600, bytes: 45330, sha256: "ce97499645dfccaf74cd87642ab3cb93def246cc1a2ffe2ebbe735e22dd08eda" },
      gallery: { path: "/theme-art/eucalyptus-04-gallery.webp", width: 720, height: 900, bytes: 78532, sha256: "f8596ebe849c1c4b2580406c549a4e980947a1705c4880c1e3bf6152c651fcd4" },
    },
  },
  {
    id: "tropics-01",
    pool: "tropics",
    prompt: "White and yellow frangipani flowers resting on dark green monstera and palm leaves, soft tropical morning light, lush and calm, portrait orientation, still-life photograph. No people, no text, no logos.",
    sourceSha256: "3a5de3afd48b387e961d0005cc6bc1f03db21dd8c94d362a698dab70f7472492",
    crop: [170, 0, 854, 1024],
    files: {
      cover: { path: "/theme-art/tropics-01-cover.webp", width: 684, height: 855, bytes: 55592, sha256: "12a0b8e00a9c69e923227d352416a54ee33361bb1fcc7dcec79023c0095ea4c5" },
      card: { path: "/theme-art/tropics-01-card.webp", width: 480, height: 600, bytes: 36014, sha256: "b2adf0ef65659c0a9be14f50adb17c1333f635fd2a55792617769d7ab60beeab" },
      gallery: { path: "/theme-art/tropics-01-cover.webp", width: 684, height: 855, bytes: 55592, sha256: "12a0b8e00a9c69e923227d352416a54ee33361bb1fcc7dcec79023c0095ea4c5" },
    },
  },
  {
    id: "tropics-02",
    pool: "tropics",
    prompt: "Dense dark tropical foliage with large glossy leaves in deep green shadows, gentle dappled light, moody and lush, portrait orientation, photograph. No people, no buildings, no text, no logos.",
    sourceSha256: "882c647ab6ca984e97eb3bfcf4fb142f63ab508f0f65033d907ff7317884c506",
    crop: [170, 0, 854, 1024],
    files: {
      cover: { path: "/theme-art/tropics-02-cover.webp", width: 684, height: 855, bytes: 91032, sha256: "30a37ca9e2287807aaef169036be4efdd4a30f759673566a616268e004bae117" },
      card: { path: "/theme-art/tropics-02-card.webp", width: 480, height: 600, bytes: 47750, sha256: "8fc1b0237742455a9ddb04d96328dc74ca3725bacb0d262a6d618e9478bce647", quality: 74 },
      gallery: { path: "/theme-art/tropics-02-cover.webp", width: 684, height: 855, bytes: 91032, sha256: "30a37ca9e2287807aaef169036be4efdd4a30f759673566a616268e004bae117" },
    },
  },
  {
    id: "tropics-03",
    pool: "tropics",
    prompt: "Frangipani blossoms scattered on warm sand-coloured stone with soft shadows of palm fronds, serene tropical mood with calm open areas, overhead photograph, portrait orientation. No people, no text, no logos.",
    sourceSha256: "cb6b77144f30e8fa7b7f17f175fcda1a82a09e77a2f8185e8a6c72996681fd91",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/tropics-03-cover.webp", width: 819, height: 1023, bytes: 73054, sha256: "aa7ef9eee3198e365b551df55ad998f26b5df8ba04318272e8f7e49e226f6b0d" },
      card: { path: "/theme-art/tropics-03-card.webp", width: 480, height: 600, bytes: 36872, sha256: "c37141f2f53bf891972e245567a13201ca93eafa4c465c55d1ca468e2def787f" },
      gallery: { path: "/theme-art/tropics-03-gallery.webp", width: 720, height: 900, bytes: 61006, sha256: "b949866593e4317e2e84c169602ea9035ac47caafa4fab97229900ce814059e2" },
    },
  },
  {
    id: "sawah-01",
    pool: "sawah",
    prompt: "Green rice terraces curving down a gentle hillside in soft morning mist, lush layered fields, calm and expansive, tropical landscape photograph, portrait orientation. No people, no buildings, no text, no logos.",
    sourceSha256: "fa3ba0e2c73a6f49307884220d930ef806f83864be1fde2beba8c1c1582f2d68",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/sawah-01-cover.webp", width: 819, height: 1023, bytes: 98900, sha256: "a3852a728f6ee2bab0d9f4e1fcc01bab542862dcce235c1a03194e86c96d23cd" },
      card: { path: "/theme-art/sawah-01-card.webp", width: 480, height: 600, bytes: 40248, sha256: "a7313e51a6057ad413965763e5ad3d380609f9c4cb2c31a4bd72fb3be07e0868" },
      gallery: { path: "/theme-art/sawah-01-gallery.webp", width: 720, height: 900, bytes: 77434, sha256: "af2c5e4f3176af0a022e22767d0051a2e2e592bfc007d78f8e1d1d2674106a5d" },
    },
  },
  {
    id: "sawah-02",
    pool: "sawah",
    prompt: "Close view of young rice plants in a flooded paddy reflecting a pale sky, fresh green tones, quiet and minimal, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "b44f1f9dd48d47ff656a5f165b8aaa67c6ad180b5b51f20f567dd606f6c33d1c",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/sawah-02-cover.webp", width: 819, height: 1023, bytes: 58458, sha256: "268c4cc503cb743db3fc8198f45bf35f6862e17be6201893c8d9204ddd66164a" },
      card: { path: "/theme-art/sawah-02-card.webp", width: 480, height: 600, bytes: 29386, sha256: "cd8b503f8af8d3c86b7d70d21abd2f281a1f5bc386a46c25de52ca016b542cd3" },
      gallery: { path: "/theme-art/sawah-02-gallery.webp", width: 720, height: 900, bytes: 48266, sha256: "5b9a98fe985cc2b664be2043b761bf4688c55eec66f3ddde1d395ffc4c37e568" },
    },
  },
  {
    id: "sawah-03",
    pool: "sawah",
    prompt: "Rice terraces at golden hour with a few palm trees along the ridge and soft haze in the valley, warm light, peaceful, portrait orientation, landscape photograph. No people, no buildings, no text, no logos.",
    sourceSha256: "20ead6bb0815d4279d8238dabc51f693c9ab036851f34139d5e5a4863889abed",
    crop: [170, 0, 854, 1024],
    files: {
      cover: { path: "/theme-art/sawah-03-cover.webp", width: 684, height: 855, bytes: 72524, sha256: "729b1cc919c6881d20be51848ad1f313b76fb27143251d0672038887573ed5e0" },
      card: { path: "/theme-art/sawah-03-card.webp", width: 480, height: 600, bytes: 40640, sha256: "a2610502a329d9c551257d1e6b316e116af77438680d220d548b8380c648134b" },
      gallery: { path: "/theme-art/sawah-03-cover.webp", width: 684, height: 855, bytes: 72524, sha256: "729b1cc919c6881d20be51848ad1f313b76fb27143251d0672038887573ed5e0" },
    },
  },
  {
    id: "batik-01",
    pool: "batik",
    prompt: "Close-up of a hand-drawn batik-style cotton cloth with an original repeating geometric floral pattern in deep indigo and warm gold-brown tones, soft raking light showing the fabric weave, portrait orientation, textile photograph. No people, no text, no logos.",
    sourceSha256: "567709689c06a8ef4b4792421787c2bad9f9ea7c38f7e1519db27aa3a324b5df",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/batik-01-cover.webp", width: 819, height: 1023, bytes: 95174, sha256: "30773fa936273e1cd1ba8e7a3bdce8a1b61cda02d8cbe8a64370f66ad6ae4c8a", quality: 74 },
      card: { path: "/theme-art/batik-01-card.webp", width: 480, height: 600, bytes: 44966, sha256: "bd76b736c67dee82cd190b0bd49a2f87f10ef6d6e31e02228a2baadf8e299585", quality: 74 },
      gallery: { path: "/theme-art/batik-01-gallery.webp", width: 720, height: 900, bytes: 88512, sha256: "b0a59a29c36486f541792bfdb3c5ffea72c07e5c441ad526a907299c5357d36b" },
    },
  },
  {
    id: "batik-02",
    pool: "batik",
    prompt: "Softly folded batik-style fabric in midnight blue with an original pattern of fine gold-brown diagonal wave motifs, gentle window light, calm and elegant, portrait orientation, textile still-life photograph. No people, no text, no logos.",
    sourceSha256: "373f8ee9b625043c5eb0e97373db58e3cf8d6787fcf1d5bedf909d4a2f0232f2",
    crop: [169, 0, 855, 1024],
    files: {
      cover: { path: "/theme-art/batik-02-cover.webp", width: 686, height: 857, bytes: 45402, sha256: "338d4bb4f0e84696f226ac8eb937bc1eaa93783e072124a331413b205672d6d0" },
      card: { path: "/theme-art/batik-02-card.webp", width: 480, height: 600, bytes: 28964, sha256: "42fc14eb35a35e04abcb9f17263ce3ac084a9ed276ce65c4798a2e53789c580f" },
      gallery: { path: "/theme-art/batik-02-cover.webp", width: 686, height: 857, bytes: 45402, sha256: "338d4bb4f0e84696f226ac8eb937bc1eaa93783e072124a331413b205672d6d0" },
    },
  },
  {
    id: "batik-03",
    pool: "batik",
    prompt: "Draped indigo and cream batik-style silk with an original small repeating floral pattern, gentle folds, warm low light, elegant and quiet, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "075df3a496792ffaf8ad370bea7785ec8c55df54c35316355289e4c0bdf2523f",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/batik-03-cover.webp", width: 819, height: 1023, bytes: 101064, sha256: "9265590c70f35e675cf9017b4362a9ab08e3bd0d7b377513f3b0aa273cc187c6", quality: 70 },
      card: { path: "/theme-art/batik-03-card.webp", width: 480, height: 600, bytes: 47842, sha256: "be5d8c2fb094470fbc30c6fad2edc7b21c3aa5d3881e5eeabb6216eae6772928", quality: 66 },
      gallery: { path: "/theme-art/batik-03-gallery.webp", width: 720, height: 900, bytes: 101534, sha256: "b44b347cb3464049cf9cf255fd60f19e8c6c8763a5daf60e9065b0419bf6c17c" },
    },
  },
  {
    id: "islamic-01",
    pool: "islamic",
    prompt: "Soft sunlight casting the shadow of an eight-pointed star geometric lattice screen onto a smooth pale sand-coloured wall, calm and serene, minimal architectural photograph, portrait orientation. No people, no calligraphy, no script, no text, no logos.",
    sourceSha256: "b17f9005f35c0294fb095808d50c15009367bce6fda8549d5387b92faf4c0381",
    crop: [169, 0, 855, 1024],
    files: {
      cover: { path: "/theme-art/islamic-01-cover.webp", width: 686, height: 857, bytes: 21756, sha256: "fc76c4a5adf954adb04e0461c811e1204bc5c66fad2c78732993dd5d89cb6b6f" },
      card: { path: "/theme-art/islamic-01-card.webp", width: 480, height: 600, bytes: 13890, sha256: "4683bed0e54846d0738be8f6d234068956630e4e3f0d31d9b74799178f786e0b" },
      gallery: { path: "/theme-art/islamic-01-cover.webp", width: 686, height: 857, bytes: 21756, sha256: "fc76c4a5adf954adb04e0461c811e1204bc5c66fad2c78732993dd5d89cb6b6f" },
    },
  },
  {
    id: "islamic-02",
    pool: "islamic",
    prompt: "A row of pointed arches in a quiet white courtyard arcade with soft mint-green tiles at the base, gentle morning light, peaceful and clean, portrait orientation, architectural photograph. No people, no calligraphy, no script, no text, no logos.",
    sourceSha256: "d67ccd68d3596f63c800999abb4175bab638db8b9bc9ab0cfbe7a14b713c952f",
    crop: [170, 19, 854, 999],
    files: {
      cover: { path: "/theme-art/islamic-02-cover.webp", width: 684, height: 855, bytes: 51764, sha256: "9646da3ab5c0baa78560bb63c7ea5db15f26770655bf828ec3dad9b463974103" },
      card: { path: "/theme-art/islamic-02-card.webp", width: 480, height: 600, bytes: 30760, sha256: "bb1f768ce1f5fbe2f1ce883ffaa4a56ab40feb7824bf1d919127fe0f00aac649" },
      gallery: { path: "/theme-art/islamic-02-cover.webp", width: 684, height: 855, bytes: 51764, sha256: "9646da3ab5c0baa78560bb63c7ea5db15f26770655bf828ec3dad9b463974103" },
    },
  },
  {
    id: "islamic-03",
    pool: "islamic",
    prompt: "A single carved geometric star motif in smooth warm sandstone, soft side light, shallow depth of field so most of the surface falls into a gentle blur, calm and elegant with plain stone around it, portrait orientation, architectural detail photograph. No people, no calligraphy, no script, no text, no logos.",
    sourceSha256: "022fd0c4d5e8ce63a5195c90e024dcfb04416924505ed2a98f33c49cca584650",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/islamic-03-cover.webp", width: 819, height: 1023, bytes: 41100, sha256: "8ff912970014a467133fbd7766ebcf04666147ca46bd7839a4fc3bb941b4a538" },
      card: { path: "/theme-art/islamic-03-card.webp", width: 480, height: 600, bytes: 16890, sha256: "5bbf5da9e6b73c46939e11ba5062970d842df31d3046c8988951d945e2c5a727" },
      gallery: { path: "/theme-art/islamic-03-gallery.webp", width: 720, height: 900, bytes: 31740, sha256: "83adeabd438c5601cacebfd9da2dc3159d83033052bf3f359e135bc16691ad60" },
    },
  },
  {
    id: "islamic-04",
    pool: "islamic",
    prompt: "A thin crescent moon in a soft pale twilight sky above the simple silhouette of a low dome, calm and contemplative, muted mint and sand tones with a wide empty sky, portrait orientation, photograph. No people, no calligraphy, no script, no text, no logos.",
    sourceSha256: "7056cc87a2b80ccea110357502ce530afedea806853a0568b5441812aa11f3bc",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/islamic-04-cover.webp", width: 819, height: 1023, bytes: 14760, sha256: "7d1692ab5fa759c2678e2e4ef1786bf029b188100b6518c70346718fec711285" },
      card: { path: "/theme-art/islamic-04-card.webp", width: 480, height: 600, bytes: 6166, sha256: "f2da10d3c8e73bb10e138a9f90ceb50efcc59e22c4c15c396661880916f56ac6" },
      gallery: { path: "/theme-art/islamic-04-gallery.webp", width: 720, height: 900, bytes: 11880, sha256: "bc9e7bf50f247c45e70371f19c703fbdf7e5a8b028033ba0960c52f327e03012" },
    },
  },
  {
    id: "boho-01",
    pool: "boho",
    prompt: "Dried pampas grass and bunny tails in soft cream and beige tones against a warm plain plaster wall, soft natural light, airy boho mood with calm empty space, portrait orientation, still-life photograph. No people, no text, no logos.",
    sourceSha256: "59c30ad7da3204fbcc1c4432655f95af72bcee19f429c802041f8a2d6c307129",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/boho-01-cover.webp", width: 819, height: 1023, bytes: 35430, sha256: "675bccd74d19fbe606e1b855e855f421ca5eab0b8049d4759e2ce05762729613" },
      card: { path: "/theme-art/boho-01-card.webp", width: 480, height: 600, bytes: 15210, sha256: "d34bc43c35f891e201fae3c83a3e9d8b5c8429bc8dfc62382f5c56a98418894d" },
      gallery: { path: "/theme-art/boho-01-gallery.webp", width: 720, height: 900, bytes: 28970, sha256: "2e5b6fb122972563dafcebdc964dd39c886293342ae129308b4fa188810f7f39" },
    },
  },
  {
    id: "boho-02",
    pool: "boho",
    prompt: "A loose arrangement of dried flowers in terracotta, cream and dusty rose on a linen cloth, gentle shadows, warm and calm with open areas, overhead still-life photograph, portrait orientation. No people, no text, no logos.",
    sourceSha256: "1c097a047c2f97a54ee7fa2d239909233155e58fd8f4c4fc010eaf0dd058bff9",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/boho-02-cover.webp", width: 819, height: 1023, bytes: 90440, sha256: "7147205d5fcc9016cabb67feb6fa675e41f9cb30eeb8d896883bd2e35841ae96", quality: 74 },
      card: { path: "/theme-art/boho-02-card.webp", width: 480, height: 600, bytes: 47902, sha256: "ee4628298fb527c3a93e650d69e356e8e513c214583941b24b777971dfe1ff64" },
      gallery: { path: "/theme-art/boho-02-gallery.webp", width: 720, height: 900, bytes: 86274, sha256: "f1e39366c290111e7c306bdf8face8107a892bd443e43ce7bdba2bd568f600ee" },
    },
  },
  {
    id: "boho-03",
    pool: "boho",
    prompt: "Close-up of fluffy pampas plumes backlit by warm golden light, soft focus, dreamy and neutral, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "e4d7d369fd15a2d5df52210dc88bac14e3958b9b92efd9c5c9a2344436ab4b7b",
    crop: [163, 14, 861, 1010],
    files: {
      cover: { path: "/theme-art/boho-03-cover.webp", width: 698, height: 872, bytes: 45370, sha256: "bcc31bbfa2ec52c9ad0da3cd424f0e39723c1328c481dce71b3e201f773c565c" },
      card: { path: "/theme-art/boho-03-card.webp", width: 480, height: 600, bytes: 27796, sha256: "95bd9ec8d7e33842afd4004ecbd65f19554e319fc9a75fc1f83349240d9be151" },
      gallery: { path: "/theme-art/boho-03-cover.webp", width: 698, height: 872, bytes: 45370, sha256: "bcc31bbfa2ec52c9ad0da3cd424f0e39723c1328c481dce71b3e201f773c565c" },
    },
  },
  {
    id: "beach-01",
    pool: "beach",
    prompt: "Gentle ocean waves rolling onto smooth sand at golden hour, soft warm light on the water, calm and open, portrait orientation, seascape photograph. No people, no boats, no buildings, no text, no logos.",
    sourceSha256: "196db191c5c46910fcbb65edb25be956c340433bc1c21af1f8e95bdd5348a143",
    crop: [170, 14, 841, 1011],
    files: {
      cover: { path: "/theme-art/beach-01-cover.webp", width: 671, height: 838, bytes: 55604, sha256: "475916b21e11ac551bf7e126d9eba03512353b6329c61ff14a4e52733851819c" },
      card: { path: "/theme-art/beach-01-card.webp", width: 480, height: 600, bytes: 32246, sha256: "82b5390abf9afb72e088af4d563b80a7ce4f5503e2661ce539ceec47e762ff92" },
      gallery: { path: "/theme-art/beach-01-cover.webp", width: 671, height: 838, bytes: 55604, sha256: "475916b21e11ac551bf7e126d9eba03512353b6329c61ff14a4e52733851819c" },
    },
  },
  {
    id: "beach-02",
    pool: "beach",
    prompt: "Soft white clouds over a calm pale blue sea horizon, airy and peaceful pastel morning light, minimal composition with a large sky area, portrait orientation, photograph. No people, no boats, no text, no logos.",
    sourceSha256: "47996587cedc475512d8fe8a8f8b3c90da087d80d93c5cc8f01a09a3f9ffb119",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/beach-02-cover.webp", width: 819, height: 1023, bytes: 17846, sha256: "a6ec273c44527cc342ab66fd9d7f98800b3c34fe6a301f481d63dd25c4fafa63" },
      card: { path: "/theme-art/beach-02-card.webp", width: 480, height: 600, bytes: 7832, sha256: "a331b325d7e6d4dc6932610dfa5e88d6d5a28434c1616bf6eae86047dc312a47" },
      gallery: { path: "/theme-art/beach-02-gallery.webp", width: 720, height: 900, bytes: 14854, sha256: "b2ac9b763a2a5ceed5996ce7f195865d48850c736f1d6412bdcccf59be634f4b" },
    },
  },
  {
    id: "beach-03",
    pool: "beach",
    prompt: "Aerial view of turquoise water meeting white foam and pale sand, clean abstract shoreline, bright soft light, portrait orientation, photograph. No people, no boats, no text, no logos.",
    sourceSha256: "30cba10ed6f23a8560d0dde6e766ef5b8641ad0eb55166506428b0c03f02e087",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/beach-03-cover.webp", width: 819, height: 1023, bytes: 77122, sha256: "992f2904c8e5cccacb534afa3c02c35cb684b36001f3222de1101a413be6560c" },
      card: { path: "/theme-art/beach-03-card.webp", width: 480, height: 600, bytes: 33216, sha256: "2962b6bd933a5c196926af4e25349cc61a8d580a03d6e4398ad2c71a89012363" },
      gallery: { path: "/theme-art/beach-03-gallery.webp", width: 720, height: 900, bytes: 62130, sha256: "06f83a2c77c020c5778e249156d1c8475e7b0e6b15ffcce6beb081227f29346f" },
    },
  },
  {
    id: "mist-01",
    pool: "mist",
    prompt: "Morning mist drifting through a quiet pine forest, soft diffused light rays, muted blue-grey tones, poetic and calm, portrait orientation, landscape photograph. No people, no buildings, no text, no logos.",
    sourceSha256: "1b3ca6d3504740af1219d87335e8d5f17b461c7571b9a2bf8ee3f8b29f329cde",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/mist-01-cover.webp", width: 819, height: 1023, bytes: 99732, sha256: "1c78c1998d33edf9c5392db0b0f5a1e81b9525625ebf6988417b6747d1ef606b", quality: 70 },
      card: { path: "/theme-art/mist-01-card.webp", width: 480, height: 600, bytes: 43886, sha256: "d1f6e6319fc8ea0a36d6094e68a1fd3d62e1a5194e6dbeea9bf23318da40f513", quality: 74 },
      gallery: { path: "/theme-art/mist-01-gallery.webp", width: 720, height: 900, bytes: 96796, sha256: "5938c9807781ba421f787bfb2322c9b51d53990790ba0f451271f26d175b116e" },
    },
  },
  {
    id: "mist-02",
    pool: "mist",
    prompt: "A still misty lake at dawn with faint reflections and soft pearl-grey light, minimal and serene, portrait orientation, photograph. No people, no boats, no text, no logos.",
    sourceSha256: "7a3bde81ab3de49148b19497ac6b6de3810ced0930deafa2dee128920110fa2a",
    crop: [170, 0, 854, 1024],
    files: {
      cover: { path: "/theme-art/mist-02-cover.webp", width: 684, height: 855, bytes: 10720, sha256: "44d7f715f1cac221bfa37a4c1eba6fcf700ab6fb747760e15ea8c15bac9e536e" },
      card: { path: "/theme-art/mist-02-card.webp", width: 480, height: 600, bytes: 6106, sha256: "95383b3474e12a53fb3cf724fcb44ae2cac90135a632f11bec0e3ea3410ff1c0" },
      gallery: { path: "/theme-art/mist-02-cover.webp", width: 684, height: 855, bytes: 10720, sha256: "44d7f715f1cac221bfa37a4c1eba6fcf700ab6fb747760e15ea8c15bac9e536e" },
    },
  },
  {
    id: "mist-03",
    pool: "mist",
    prompt: "Gentle ripples across a calm dark lake at dusk with soft pearly light reflections, abstract and tranquil, one continuous water surface filling the whole frame, close-up photograph, portrait orientation. No people, no animals, no text, no logos.",
    sourceSha256: "5d45add282b322805ce0373bef7e2ea6f08818af4416665a6a4df4c16a1499de",
    crop: [170, 0, 854, 1024],
    files: {
      cover: { path: "/theme-art/mist-03-cover.webp", width: 684, height: 855, bytes: 33902, sha256: "d90631cccf5a0ed8406333ce684cd23293f21015a5338a9bb2430eae19ed9d5b" },
      card: { path: "/theme-art/mist-03-card.webp", width: 480, height: 600, bytes: 21604, sha256: "4ff81cb2b617dfff0b59d9d957549be3cd8a424e41871e6dd5b6aefb463dd7d7" },
      gallery: { path: "/theme-art/mist-03-cover.webp", width: 684, height: 855, bytes: 33902, sha256: "d90631cccf5a0ed8406333ce684cd23293f21015a5338a9bb2430eae19ed9d5b" },
    },
  },
  {
    id: "candle-01",
    pool: "candle",
    prompt: "Warm candlelight with soft golden bokeh in a dark room, intimate evening mood, a few small candles along the bottom edge and a large calm dark area above, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "cfcc9dfa683e76becb747538235ee119dca2279855a2e15af3c918a9d42108e6",
    crop: [189, 15, 835, 1010],
    files: {
      cover: { path: "/theme-art/candle-01-cover.webp", width: 646, height: 807, bytes: 17810, sha256: "99992f1c9c96712d180df024646e259a3cbcaa7ae5c9a8ed78e9c6b66dac89f7" },
      card: { path: "/theme-art/candle-01-card.webp", width: 480, height: 600, bytes: 12408, sha256: "3f90cd24ba0860132436c66784cca334926dbf2d52a4ceb90868186ced1c4b62" },
      gallery: { path: "/theme-art/candle-01-cover.webp", width: 646, height: 807, bytes: 17810, sha256: "99992f1c9c96712d180df024646e259a3cbcaa7ae5c9a8ed78e9c6b66dac89f7" },
    },
  },
  {
    id: "candle-02",
    pool: "candle",
    prompt: "Out-of-focus warm string lights glowing against a dusky violet background, soft round bokeh, cozy and festive, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "cb12d4021a8a21f2665e17da10a0b20c1ddbeae22be3e0a89a5503fe722343f5",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/candle-02-cover.webp", width: 819, height: 1023, bytes: 39412, sha256: "dede331ed2b19492adb5d2d0ecf68baaea8f7a4af52a4f3a1b4538231cb3e66a" },
      card: { path: "/theme-art/candle-02-card.webp", width: 480, height: 600, bytes: 22060, sha256: "a9242a722f1549eee2efb81427393408c1666e687f7702c1703391bc8055edb0" },
      gallery: { path: "/theme-art/candle-02-gallery.webp", width: 720, height: 900, bytes: 33754, sha256: "b981f801d76384177647d34de01fc6e7d289c7eff4979b93d930f930257be65f" },
    },
  },
  {
    id: "candle-03",
    pool: "candle",
    prompt: "Tall slim taper candles in brass holders on a dark table, gentle flame glow and soft shadows, elegant and quiet with a dark calm background, portrait orientation, still-life photograph. No people, no text, no logos.",
    sourceSha256: "8b92d70d73c94a185847adadf9d89ba9190507a9241a549aaa717850cc3ec8a9",
    crop: [170, 0, 854, 1011],
    files: {
      cover: { path: "/theme-art/candle-03-cover.webp", width: 684, height: 855, bytes: 15592, sha256: "e73e74641640e07a226e58000e3fd940c56d1d9fb8d2843d95d564ec9b66f3b7" },
      card: { path: "/theme-art/candle-03-card.webp", width: 480, height: 600, bytes: 9722, sha256: "3c1292bf2c832aa5d1707bf3fa49a50fca3145e8762e7a1d53038181deaabf85" },
      gallery: { path: "/theme-art/candle-03-cover.webp", width: 684, height: 855, bytes: 15592, sha256: "e73e74641640e07a226e58000e3fd940c56d1d9fb8d2843d95d564ec9b66f3b7" },
    },
  },
  {
    id: "party-01",
    pool: "party",
    prompt: "A cluster of pastel lavender, mint and peach balloons floating against a plain soft pink wall, bright cheerful light, playful with a calm empty area, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "7a43c4dfea6a7c4b320aedeaa1e3a75f41b20025bdc7c57bb761b4dff9707f1e",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/party-01-cover.webp", width: 819, height: 1023, bytes: 12658, sha256: "bcdbf536dc6bfa3b74c8d39977e54d1b51375562dc86bea6c0c8676843c36a61" },
      card: { path: "/theme-art/party-01-card.webp", width: 480, height: 600, bytes: 6100, sha256: "ac6bd6427c04031fd6f4d0b052400fddfe332e826e71c696f94342b1f2509404" },
      gallery: { path: "/theme-art/party-01-gallery.webp", width: 720, height: 900, bytes: 10544, sha256: "c4f9fd6d2673d4184439e78dce9fa3add82500a5b279957710b096e8e0e3b0f2" },
    },
  },
  {
    id: "party-02",
    pool: "party",
    prompt: "Colourful plain paper bunting flags strung across a sunny warm yellow wall, cheerful festive mood, soft shadows, portrait orientation, photograph. No people, no letters, no text, no logos.",
    sourceSha256: "d88965d404d36ad84c4061bce61b3074e7deb376d5dd1311f06c04ebe91d69c7",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/party-02-cover.webp", width: 819, height: 1023, bytes: 39198, sha256: "b271bf1d0567eb88e61d8e1948df649e0bad88c9a3035b48e8c6f2c843afbef1" },
      card: { path: "/theme-art/party-02-card.webp", width: 480, height: 600, bytes: 20642, sha256: "9f38940548b48140eb3b844d2f2417ddb9a24cb6e6adcf65b7df2e1401a4391f" },
      gallery: { path: "/theme-art/party-02-gallery.webp", width: 720, height: 900, bytes: 33150, sha256: "daae9a442d652820b575c841d0e8d5851c601d0996d2e3aa837d4c89726fbaa5" },
    },
  },
  {
    id: "party-03",
    pool: "party",
    prompt: "Scattered round confetti in marigold yellow, orange and white on a soft cream surface, joyful and bright with calm open areas, overhead photograph, portrait orientation. No people, no text, no logos.",
    sourceSha256: "b34bdfd15de8dff7ea234c0811e9bd7cd0821326f612313147715616c9011679",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/party-03-cover.webp", width: 819, height: 1023, bytes: 48448, sha256: "583d5ba1f22bb7f577402a6454d1ecbc6228a3611264f746568060a0ddc7b961" },
      card: { path: "/theme-art/party-03-card.webp", width: 480, height: 600, bytes: 13184, sha256: "a04e590bfb95df0536aa951bc3803f2ed031eceaebdb91b4533acea47a5fbaa1" },
      gallery: { path: "/theme-art/party-03-gallery.webp", width: 720, height: 900, bytes: 31070, sha256: "91603fd782b204780b496f22606bb870a91c95148019565c5d02551f0bd37f2c" },
    },
  },
  {
    id: "party-04",
    pool: "party",
    prompt: "Soft peach and blush balloons with curling ribbons against a pale peach backdrop, gentle diffuse light, sweet and tender with an empty area above, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "4b053ac90538f6a85c70dc9929f4323f82f18276168341f5b910c998460e5d31",
    crop: [170, 0, 854, 1024],
    files: {
      cover: { path: "/theme-art/party-04-cover.webp", width: 684, height: 855, bytes: 13036, sha256: "691677c5eea97ae2ab44cc31fbbfb36f741d4e65771ed1fafb05302d456802b8" },
      card: { path: "/theme-art/party-04-card.webp", width: 480, height: 600, bytes: 8170, sha256: "6f10b93a80cf8b8fd1c39f776c6ed73900823b57c83a9abe6d8ae41a7db56ce6" },
      gallery: { path: "/theme-art/party-04-cover.webp", width: 684, height: 855, bytes: 13036, sha256: "691677c5eea97ae2ab44cc31fbbfb36f741d4e65771ed1fafb05302d456802b8" },
    },
  },
  {
    id: "party-05",
    pool: "party",
    prompt: "Strings of warm terracotta and ochre paper lanterns hanging under an open evening sky, festive village celebration mood, soft glow, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "9ecaf6d967379883ff2c85bc2d78e73bcfd08dd9b2751ba8a4a05307efc4cf41",
    crop: [170, 0, 854, 1024],
    files: {
      cover: { path: "/theme-art/party-05-cover.webp", width: 684, height: 855, bytes: 80612, sha256: "352e8f2128724f276f47b0fd48eee16b965943b47818b86199017d909e4c56a9" },
      card: { path: "/theme-art/party-05-card.webp", width: 480, height: 600, bytes: 47478, sha256: "fb1e20246cf7cb0c34012f2da7314bca46e718bbef775e24f13204f5fc66017e" },
      gallery: { path: "/theme-art/party-05-cover.webp", width: 684, height: 855, bytes: 80612, sha256: "352e8f2128724f276f47b0fd48eee16b965943b47818b86199017d909e4c56a9" },
    },
  },
  {
    id: "fireworks-01",
    pool: "fireworks",
    prompt: "Golden fireworks bursting high in a deep midnight blue night sky, long exposure trails, celebratory and elegant with a large dark calm area below, portrait orientation, photograph. No people, no buildings, no text, no logos.",
    sourceSha256: "9b504df0aa1734bba3126138458fdb9cd674ca832050708a5179c1e10e0f24c7",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/fireworks-01-cover.webp", width: 819, height: 1023, bytes: 74820, sha256: "98e4fbbe3812bf81e2ec77bf9b427bc2f5b47555b3ebcd55e2647db76ab3a6e9" },
      card: { path: "/theme-art/fireworks-01-card.webp", width: 480, height: 600, bytes: 31346, sha256: "d3771bfbd5f0269948b8b5759930f2f3cdb6cfaaa34899475a3052e224bdc7d2" },
      gallery: { path: "/theme-art/fireworks-01-gallery.webp", width: 720, height: 900, bytes: 60346, sha256: "afe7502209622a2b89d6f89c49364037e6e4db717669f70a0c26a40c63347456" },
    },
  },
  {
    id: "fireworks-02",
    pool: "fireworks",
    prompt: "Soft pink and rose-gold sparkling firework bursts against a dusky night sky, dreamy bokeh, festive and romantic, portrait orientation, photograph. No people, no buildings, no text, no logos.",
    sourceSha256: "5e953240f2686bf576b223cd49d9f2a3bbb6415c1c52040df166d27e5822d970",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/fireworks-02-cover.webp", width: 819, height: 1023, bytes: 78362, sha256: "230fd7dc0d26e0db8ca97fb92003e10c18080fedb3c2cf96fce9fe22a162fb88" },
      card: { path: "/theme-art/fireworks-02-card.webp", width: 480, height: 600, bytes: 38890, sha256: "6446c9e68f61f1908d25681ce3105abbbb67ed8016700459973f7c36454e2871" },
      gallery: { path: "/theme-art/fireworks-02-gallery.webp", width: 720, height: 900, bytes: 66676, sha256: "1deb5d8e5a501c463e2eb83394e8f31e02bf57ffa075a5a11768eeb2d4c8a7b7" },
    },
  },
  {
    id: "fireworks-03",
    pool: "fireworks",
    prompt: "Multicoloured fireworks in red, teal and gold over a dark sky, vivid celebratory bursts with faint smoke trails, portrait orientation, photograph. No people, no buildings, no text, no logos.",
    sourceSha256: "b67f25899354d6676372c31d32ba946e105e0f47ca5ffb4b2660e4ae681c53c8",
    crop: [183, 72, 1024, 960],
    files: {
      cover: { path: "/theme-art/fireworks-03-cover.webp", width: 710, height: 887, bytes: 98064, sha256: "571cf009f06faf0f282a7964793ae0254a4dc7496c8c343091fd0523bcd65464", quality: 74 },
      card: { path: "/theme-art/fireworks-03-card.webp", width: 480, height: 600, bytes: 48408, sha256: "8bc0f9844b89dcacae30162163f88b6ed5cc216ee0880dbeff5a82c5f8cdcaf4", quality: 66 },
      gallery: { path: "/theme-art/fireworks-03-cover.webp", width: 710, height: 887, bytes: 98064, sha256: "571cf009f06faf0f282a7964793ae0254a4dc7496c8c343091fd0523bcd65464", quality: 74 },
    },
  },
  {
    id: "fireworks-04",
    pool: "fireworks",
    prompt: "Close-up of a glowing sparkler fizzing with warm golden sparks against a dark background, shallow depth of field, festive, portrait orientation, photograph. No people, no hands, no text, no logos.",
    sourceSha256: "82ec81a65bee2108db42d98720546add288af50266eb4912ea13d901eff5cb9d",
    crop: [183, 25, 841, 999],
    files: {
      cover: { path: "/theme-art/fireworks-04-cover.webp", width: 658, height: 822, bytes: 32206, sha256: "c177a1dbf85613db92d7dd40810a4bbb52e0605067bf9f66705d134b9c42d6e9" },
      card: { path: "/theme-art/fireworks-04-card.webp", width: 480, height: 600, bytes: 21474, sha256: "33a76c4091616e1999e107c9038d930e22a6f8a9aae192b8840d0c98916ae25a" },
      gallery: { path: "/theme-art/fireworks-04-cover.webp", width: 658, height: 822, bytes: 32206, sha256: "c177a1dbf85613db92d7dd40810a4bbb52e0605067bf9f66705d134b9c42d6e9" },
    },
  },
  {
    id: "fireworks-05",
    pool: "fireworks",
    prompt: "Falling metallic gold and silver confetti streamers caught in warm spotlights against a dark background, energetic celebration, portrait orientation, photograph. No people, no stage, no text, no logos.",
    sourceSha256: "f0e4cd7a9a53ddf6c0deda83afe1151384f646cc2af9a6f5e44cd30450d83242",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/fireworks-05-cover.webp", width: 819, height: 1023, bytes: 84672, sha256: "dec61f3834141e8256bdcb70949a5105980c637d0832db85a791c44daf9f99ce" },
      card: { path: "/theme-art/fireworks-05-card.webp", width: 480, height: 600, bytes: 47656, sha256: "6bae8db8fcccc16d3b93eeac70fdaf927c275b4e5a9d1990c9079bfa12e63cfa" },
      gallery: { path: "/theme-art/fireworks-05-gallery.webp", width: 720, height: 900, bytes: 73624, sha256: "636a72a72bc910cdd634d18562cfa8dde50ef86cbbcf2c1f186b6f4b48a7a8d5" },
    },
  },
  {
    id: "fireworks-06",
    pool: "fireworks",
    prompt: "A single large white-gold firework chrysanthemum burst in a clear black sky with faint stars, minimal and grand with wide dark empty space, portrait orientation, photograph. No people, no buildings, no text, no logos.",
    sourceSha256: "964c76a0182a076c854d682574f554987e5cce02f6e7c61a022c0a90934fd080",
    crop: [184, 25, 840, 999],
    files: {
      cover: { path: "/theme-art/fireworks-06-cover.webp", width: 656, height: 820, bytes: 43258, sha256: "b3aec915c04a8723d15b73ec514d362eb95dd2b5f96ef4c97e520cc0c15c0c29" },
      card: { path: "/theme-art/fireworks-06-card.webp", width: 480, height: 600, bytes: 26418, sha256: "a72cf2f2ee7c0843dc6fe4de7d4ed4e0a485cdb11d550a1b4358d82788c45a8f" },
      gallery: { path: "/theme-art/fireworks-06-cover.webp", width: 656, height: 820, bytes: 43258, sha256: "b3aec915c04a8723d15b73ec514d362eb95dd2b5f96ef4c97e520cc0c15c0c29" },
    },
  },
  {
    id: "elegant-01",
    pool: "elegant",
    prompt: "A crystal chandelier glowing warmly in an empty elegant ballroom with soft mocha and cream tones, shallow depth of field, formal and calm, portrait orientation, interior photograph. No people, no text, no logos.",
    sourceSha256: "72517abcb2e7e4db23ae27955dfbb2a17f5a4b346bc1f853e57a1249d495eae3",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/elegant-01-cover.webp", width: 819, height: 1023, bytes: 70852, sha256: "2e8e3d0d5e23e8f6a311ecf9f100dafd8c6c72375fc077effb971f393314d5a3" },
      card: { path: "/theme-art/elegant-01-card.webp", width: 480, height: 600, bytes: 34576, sha256: "e972b4813cf9b263a643084813b98aebacef96082bc54835956f9d7ff0e269e5" },
      gallery: { path: "/theme-art/elegant-01-gallery.webp", width: 720, height: 900, bytes: 59598, sha256: "8584d4b5e568bb5027b82acaf454b00892086a57cabf846d7e80d4156019837c" },
    },
  },
  {
    id: "elegant-02",
    pool: "elegant",
    prompt: "Close-up of crystal chandelier drops catching warm golden light with a soft bokeh background, refined and luxurious, portrait orientation, photograph. No people, no text, no logos.",
    sourceSha256: "2c91aa256117767036180b91441b063bfc99e30661d199f6036c2da2417b53e2",
    crop: [0, 0, 1024, 1024],
    files: {
      cover: { path: "/theme-art/elegant-02-cover.webp", width: 819, height: 1023, bytes: 70152, sha256: "9e2f227f06c40b3327740aac3da06d7a53bd5352d0f01b62e12247e4d9be2b19" },
      card: { path: "/theme-art/elegant-02-card.webp", width: 480, height: 600, bytes: 37360, sha256: "b93adfc2155e15f6c5f4fb271ad26b8e827a7c24286e69f2f402de1ac27a19ac" },
      gallery: { path: "/theme-art/elegant-02-gallery.webp", width: 720, height: 900, bytes: 59998, sha256: "86d808506799dd2d1c5bd0a19cb83832928355333bc1962d96b24776898762e2" },
    },
  },
  {
    id: "elegant-03",
    pool: "elegant",
    prompt: "An empty long banquet table with ivory linen, brass candlesticks and soft warm light in a grand room, formal and quiet, portrait orientation, interior photograph. No people, no text, no logos.",
    sourceSha256: "6c930a2d2b8b73f4b7cc27165ead822987dcece982e4bc328628df1bd2965b0d",
    crop: [0, 0, 832, 1024],
    files: {
      cover: { path: "/theme-art/elegant-03-cover.webp", width: 819, height: 1023, bytes: 67150, sha256: "11d7b4500a7663e8090caf155f35963ccf67913cba6b108b53ef3059a4f8fa29" },
      card: { path: "/theme-art/elegant-03-card.webp", width: 480, height: 600, bytes: 33354, sha256: "0241a6abc8034cf59da2e6a41c9600308e8af20fe1df914c38f70c62287d65b1" },
      gallery: { path: "/theme-art/elegant-03-gallery.webp", width: 720, height: 900, bytes: 56920, sha256: "5788d45861cefa6e2efc48615d2a7069354eab3fad6fcd8b20ec280e78a04411" },
    },
  },
] as const satisfies readonly ThemeArtAsset[];

/** A harness manifest asset (`tools/template-harness/schema.ts`), one per distinct file. */
export type ThemeArtManifestAsset = {
  id: string;
  path: string;
  kind: 'image';
  bytes: number;
  width: number;
  height: number;
  license: string;
  source: string;
  author: string;
  provenance: 'generated';
  deferred: false;
};

/**
 * The register in the harness's asset shape, so a catalog manifest (G-062) can declare these files like any template
 * asset. A gallery file identical to its cover is listed once.
 */
export function themeArtManifestAssets(register: readonly ThemeArtAsset[] = THEME_ART_REGISTER): ThemeArtManifestAsset[] {
  const seen = new Set<string>();
  const assets: ThemeArtManifestAsset[] = [];
  for (const entry of register) {
    for (const kind of ['cover', 'card', 'gallery'] as const) {
      const file = entry.files[kind];
      if (seen.has(file.path)) continue;
      seen.add(file.path);
      assets.push({
        id: `${entry.id}-${kind}`,
        path: `public${file.path}`,
        kind: 'image',
        bytes: file.bytes,
        width: file.width,
        height: file.height,
        license: THEME_ART_PROVENANCE.license,
        source: `Generated for this repository (${THEME_ART_PROVENANCE.generator}, ${THEME_ART_PROVENANCE.created}; prompt: ${entry.prompt}), ${THEME_ART_PROVENANCE.derivation}`,
        author: THEME_ART_PROVENANCE.author,
        provenance: THEME_ART_PROVENANCE.provenance,
        deferred: false,
      });
    }
  }
  return assets;
}
