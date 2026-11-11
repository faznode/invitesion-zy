import type { Occasion } from './occasion';

/**
 * Design families (B-030, template system v2): trusted layout code that renders the same invitation content as the
 * legacy page through the content contract, with its own composition. A family is opt-in per invitation
 * (`theme.familyId`); a missing or unknown id keeps the legacy layout, so retiring a family never breaks a stored
 * invitation. Families use only palette tokens (B-016) and the two self-hosted fonts.
 */
export const FAMILY_IDS = ['gapura', 'kartu', 'riang', 'lontar'] as const;
export type FamilyId = (typeof FAMILY_IDS)[number];

type Label = { id: string; en: string };

export type IntendedFor = 'wedding' | 'celebration' | 'formal';

/** How the editor names what a family is designed around. */
export const INTENDED_FOR_LABEL: Record<IntendedFor, Label> = {
  wedding: { id: 'pernikahan', en: 'weddings' },
  celebration: { id: 'syukuran & perayaan', en: 'celebrations' },
  formal: { id: 'acara resmi & kantor', en: 'formal and company events' },
};

export type FamilyMeta = {
  id: FamilyId;
  name: string;
  /** What the composition is designed around; every family still renders every event type. */
  intendedFor: IntendedFor;
  summary: Label;
};

export const FAMILIES: Record<FamilyId, FamilyMeta> = {
  gapura: {
    id: 'gapura',
    name: 'Gapura',
    intendedFor: 'wedding',
    summary: {
      id: 'Simetris dan khidmat: sampul, kartu acara, dan formulir berada di dalam lengkung gapura.',
      en: 'Symmetric and ceremonial: the cover, event cards and forms sit inside gate arches.',
    },
  },
  kartu: {
    id: 'kartu',
    name: 'Kartu',
    intendedFor: 'wedding',
    summary: {
      id: 'Tumpukan kartu cetak yang asimetris; setiap acara tampil sebagai tiket berperforasi.',
      en: 'An asymmetric stack of printed cards; each event appears as a perforated ticket.',
    },
  },
  riang: {
    id: 'riang',
    name: 'Riang',
    intendedFor: 'celebration',
    summary: {
      id: 'Pita warna selebar layar, tanggal bergaya kalender, dan umbul-umbul untuk ulang tahun, syukuran, dan acara kantor.',
      en: 'Full-width tinted bands, calendar-tile dates and bunting for birthdays, thanksgivings and company events.',
    },
  },
  lontar: {
    id: 'lontar',
    name: 'Lontar',
    intendedFor: 'formal',
    summary: {
      id: 'Berpusat pada susunan acara: selembar daun lontar membawa tanggal, jam, dan tempat, lalu jadwal tampil sebagai baris waktu yang mudah dipindai.',
      en: 'Programme-led: a palm-leaf band carries the date, time and venue, then the schedule reads as rows of times that are easy to scan.',
    },
  },
};

export function familyOf(id?: string | null): FamilyMeta | null {
  return id && (FAMILY_IDS as readonly string[]).includes(id) ? FAMILIES[id as FamilyId] : null;
}

/**
 * F-02 (D-041 (3)): the family a new invitation starts on, by event type: the composition designed around it. Every
 * family renders every event type, the host can pick another or the legacy layout in the editor, and stored invitations
 * are never touched.
 */
const DEFAULT_FAMILY_BY_EVENT_TYPE: Readonly<Record<string, FamilyId>> = {
  wedding: 'gapura',
  birthday: 'riang',
  aqiqah: 'riang',
  tasyakuran: 'riang',
  khitanan: 'riang',
  corporate: 'lontar',
};

export function defaultFamilyFor(eventType: string, occasion?: Occasion): FamilyId | undefined {
  // B-032 (G-060): a memorial starts on the symmetric, solemn composition, never on a celebration's bunting.
  if (occasion === 'memorial') return 'gapura';
  return Object.hasOwn(DEFAULT_FAMILY_BY_EVENT_TYPE, eventType) ? DEFAULT_FAMILY_BY_EVENT_TYPE[eventType] : undefined;
}
