import { z } from 'zod';
import corpusFile from '@/content/verified-religious-texts/corpus.json';

/**
 * Access to the owner-approved religious-text corpus (ADR-O04, B-003). Nothing in the product may show scripture
 * or a religious quotation unless its text is an approved entry here; with an empty corpus nothing qualifies, so
 * presets ship without quotation blocks. Rules and fields: content/verified-religious-texts/README.md.
 */

const entrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    tradition: z.string().min(1),
    kind: z.string().min(1),
    language: z.string().min(2),
    text: z.string().min(1),
    citation: z.string().min(1),
    source: z.string().min(1),
    translationEdition: z.string().min(1).optional(),
    licence: z.string().min(1),
    verifiedBy: z.string().min(1),
    verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    approvedBy: z.string().min(1).optional(),
    status: z.enum(['approved', 'pending']),
  })
  .strict();

export const corpusSchema = z
  .object({ schemaVersion: z.literal(1), note: z.string().optional(), entries: z.array(entrySchema) })
  .strict()
  .superRefine((corpus, ctx) => {
    const seen = new Set<string>();
    corpus.entries.forEach((entry, index) => {
      if (seen.has(entry.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entries', index, 'id'], message: `duplicate id ${entry.id}` });
      seen.add(entry.id);
      if (entry.status === 'approved' && !entry.approvedBy) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entries', index, 'approvedBy'], message: 'approved entries need approvedBy' });
      }
    });
  });

export type ReligiousTextCorpus = z.infer<typeof corpusSchema>;
export type ReligiousTextEntry = z.infer<typeof entrySchema>;

export function loadCorpus(raw: unknown = corpusFile): ReligiousTextCorpus {
  return corpusSchema.parse(raw);
}

export function approvedEntry(id: string, corpus: ReligiousTextCorpus = loadCorpus()): ReligiousTextEntry | undefined {
  return corpus.entries.find((entry) => entry.id === id && entry.status === 'approved');
}

/** True only when the exact text is an approved corpus entry. */
export function isVerifiedReligiousText(text: string, corpus: ReligiousTextCorpus = loadCorpus()): boolean {
  return corpus.entries.some((entry) => entry.status === 'approved' && entry.text === text);
}

/** I-11: what a guest page shows for a corpus reference: the entry's own text and citation, and where they come from. */
export type VerifiedReligiousBlock = {
  id: string;
  text: string;
  citation: string;
  language: string;
  source: string;
  translationEdition?: string;
  verifiedBy: string;
  verifiedAt: string;
};

/**
 * I-11: the approved entry a quote names, with its provenance; null when the id is absent, unknown or not approved, so a
 * pending or withdrawn entry disappears from every page that named it. With the corpus empty this is always null.
 */
export function verifiedBlockFor(corpusId: string | null | undefined, corpus: ReligiousTextCorpus = loadCorpus()): VerifiedReligiousBlock | null {
  const entry = corpusId ? approvedEntry(corpusId, corpus) : undefined;
  if (!entry) return null;
  const { id, text, citation, language, source, translationEdition, verifiedBy, verifiedAt } = entry;
  return { id, text, citation, language, source, ...(translationEdition && { translationEdition }), verifiedBy, verifiedAt };
}

const indonesianProvenance = (source: string, verifiedBy: string, verifiedAt: string) => `Sumber: ${source}. Diperiksa oleh ${verifiedBy} (${verifiedAt}).`;

/**
 * I-11: the provenance line printed under a verified block (source, translation, who checked it and when). G-018: the
 * guest page passes its language's frame (`guest-copy.ts`); the corpus values are printed as stored. The editor bundles
 * this module, so it stays free of the guest dictionary.
 */
export function provenanceLine(
  block: VerifiedReligiousBlock,
  frame: (source: string, verifiedBy: string, verifiedAt: string) => string = indonesianProvenance,
): string {
  const source = block.translationEdition ? `${block.source}, ${block.translationEdition}` : block.source;
  return frame(source, block.verifiedBy, block.verifiedAt);
}

export type CorpusOption = { id: string; label: string };

/** I-11: the entries the editor may offer, approved ones only, in corpus order. An empty corpus offers nothing. */
export function approvedCorpusOptions(corpus: ReligiousTextCorpus = loadCorpus()): CorpusOption[] {
  return corpus.entries
    .filter((entry) => entry.status === 'approved')
    .map((entry) => ({ id: entry.id, label: `${entry.citation} (${entry.language})` }));
}

// Scripture references ("QS. Ar-Rum: 21", "HR. Bukhari", "Matius 19:6", "1 Korintus 13:4") and religious vocabulary.
// Deliberately broad: a false positive only asks for a corpus entry, a false negative would ship unverified scripture.
const SCRIPTURE_SOURCE = /\b(Q\.?\s?S|Al[\s-]?Qur'?an|Surah|Surat|H\.?R|Hadits?|Hadis|Injil|Alkitab|Bible|Weda|Veda|Bhagavad|Dhammapada|Tripitaka)\b/i;
const CHAPTER_VERSE = /\b[1-3]?\s?[A-Z][a-z]+\.?\s+\d{1,3}\s*:\s*\d{1,3}/;
const RELIGIOUS_TERMS = /\b(Allah|Tuhan|Gusti|Rabb|Rasulullah|Nabi|Yesus|Kristus|Sang Hyang|Widhi|Buddha|God|Lord|Jesus|Christ|salat|shalat|sholat|insya\s?Allah|masya\s?Allah|bismillah\w*|alhamdulillah|aamiin|amin)\b/i;

export function looksReligious(text?: string | null, citation?: string | null): boolean {
  const joined = `${text ?? ''}\n${citation ?? ''}`;
  return SCRIPTURE_SOURCE.test(joined) || CHAPTER_VERSE.test(citation ?? '') || RELIGIOUS_TERMS.test(joined);
}

export type UnverifiedReligiousText = { path: string; text: string };

/**
 * Religious text in a preset or template config that is not an approved corpus entry (B-003, ADR-O04 rule 3).
 * `greetings.prayer` is religious by definition; a `quote` counts when its text or citation looks religious, so
 * attributed literary quotes stay allowed. Customer-written invitation content is never checked with this.
 */
export function findUnverifiedReligiousText(
  config: {
    greetings?: { prayer?: string | null } | null;
    quote?: { enabled?: boolean; text?: string | null; author?: string | null; corpusId?: string | null } | null;
  },
  corpus: ReligiousTextCorpus = loadCorpus(),
): UnverifiedReligiousText[] {
  const found: UnverifiedReligiousText[] = [];
  const prayer = config.greetings?.prayer?.trim();
  if (prayer && !isVerifiedReligiousText(prayer, corpus)) found.push({ path: 'greetings.prayer', text: prayer });
  const quote = config.quote;
  // I-11: a reference counts only while it names an approved entry.
  if (quote?.corpusId && !approvedEntry(quote.corpusId, corpus)) found.push({ path: 'quote.corpusId', text: quote.corpusId });
  const quoteText = quote?.text?.trim();
  if (quoteText && looksReligious(quoteText, quote?.author) && !isVerifiedReligiousText(quoteText, corpus)) {
    found.push({ path: 'quote.text', text: quoteText });
  }
  return found;
}
