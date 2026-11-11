'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDollarSign, Clapperboard, Eye, FileText, Gift, Heart, History, ImagePlus, Images, Info, Loader2, MapPin, MessageCircleHeart, MessageSquareText, Music2, PartyPopper, Plus, Quote, Radio, Save, Sparkles, Trash2, UserRound, UsersRound, Video } from 'lucide-react';
import { sectionForEditorTab, storedOnlyNotice } from '@/lib/invitation/content-contract';
import { newEventId } from '@/lib/invitation/event-ids';
import { FAMILIES, FAMILY_IDS, familyOf, INTENDED_FOR_LABEL } from '@/lib/invitation/families';
import { isMemorial, MEMORIAL_COPY } from '@/lib/invitation/occasion';
import type { CorpusOption } from '@/lib/invitation/religious-text';
import type { ThemeSwitchOption } from '@/lib/invitation/theme-switch';
import type { Tier } from '@/lib/pricing';
import { LayoutChoices, PaletteChoice, type PaletteOption } from './editor-appearance';
import { GuestLanguageChoice } from './editor-language';
import { GuestShareChoice } from './editor-share';
import { CardExportChoice } from './editor-card-export';
import { GuestPasscodeChoice } from './editor-passcode';
import { ConflictBanner, PreviewPane, SaveStatus, useEditorSave } from './editor-save';
import { ThemeSwitch } from './editor-theme';

type Config = Record<string, any>;
type Asset = { id: number; url: string; type: string; sortOrder: number; uploadSequence: number | null };

type Props = {
  invitationId: number;
  previewHref: string;
  /** The owner preview for the side-by-side pane (B-035). */
  embedPreviewHref: string;
  eventType: string;
  locale: 'id' | 'en';
  initialConfig: Config;
  /** The version `initialConfig` belongs to, read in the same statement (B-035). */
  initialVersion: number;
  /** FLAG_EDITOR_AUTOSAVE (B-035). */
  autosave: boolean;
  initialMedia: Asset[];
  /** B-036: the catalog themes this invitation may switch to, and the tier it is entitled to. */
  themeOptions: ThemeSwitchOption[];
  themeTier: Tier;
  /** G-041: every registered palette with the tier it needs (the colour choice). */
  paletteOptions: PaletteOption[];
  /** I-11: the owner-approved religious texts the quote may name (none while the corpus is empty). */
  corpusOptions: CorpusOption[];
  /** FLAG_GUEST_LANGUAGE (G-018): off hides the language choice; a stored choice is kept by the save merge. */
  guestLanguage: boolean;
  guestShare: boolean;
  /** FLAG_CARD_EXPORT (G-055): off hides the printable-card opt-in; a stored opt-in is kept by the save merge. */
  cardExport: boolean;
  /**
   * G-046: the owner's version history, or null (FLAG_VERSION_HISTORY off). A plain link, not client navigation, so the
   * unsaved-changes guard (`beforeunload` in editor-save.tsx) still asks before edits are left behind.
   */
  historyHref?: string | null;
  /** G-047: the guest passcode's state (never the code), or null (FLAG_GUEST_PASSCODE off: no card). */
  guestPasscode?: { enabled: boolean; setAt: string | null } | null;
  /** I-21: offer the post-event memory card (FLAG_POST_EVENT_MEMORY); its settings are content, saved like any section. */
  postEventMemory?: boolean;
};
type ThemeChoices = { options: ThemeSwitchOption[]; tier: Tier; palettes: PaletteOption[] };
const modules = [
  ['settings', 'Control center'], ['couple', 'Pengantin'], ['theme', 'Tema & Cover'], ['events', 'Acara'], ['music', 'Musik'], ['greetings', 'Ucapan & Doa'], ['gift', 'Kado'], ['rsvp', 'RSVP'], ['gallery', 'Galeri'], ['guestbook', 'Buku Tamu'], ['eventPlanner', 'Event Planner'], ['streaming', 'Streaming'], ['story', 'Kisah cinta'], ['instagramStory', 'Instagram Story'], ['quote', 'Quote'], ['whatsapp', 'WhatsApp'],
] as const;
type Tab = typeof modules[number][0];

// Deskripsi singkat tiap section, tampil di bawah judul saat mengedit biar
// tidak polosan. 'couple' di-override per tipe event lewat coupleDesc().
const SECTION_DESC: Partial<Record<Tab, string>> = {
  couple: 'Lengkapi identitas kedua mempelai. Data ini yang tampil paling utama di undangan.',
  theme: 'Atur tema, palet warna, gambar cover, dan headline undangan.',
  events: 'Tambahkan jadwal acara: nama, tanggal, waktu, lokasi, dan tautan Maps.',
  music: 'Pilih musik latar yang diputar saat tamu membuka undangan.',
  greetings: 'Kelola kolom ucapan dan doa yang bisa diisi tamu.',
  gift: 'Sediakan info rekening atau e-wallet untuk tamu yang ingin mengirim hadiah.',
  rsvp: 'Atur konfirmasi kehadiran tamu beserta batas waktunya.',
  gallery: 'Unggah foto-foto yang tampil di galeri undangan. Urutan mengikuti urutan unggah.',
  guestbook: 'Atur judul, teks pengantar, dan moderasi buku tamu.',
  eventPlanner: 'Catatan persiapan internal acara. Tidak tampil ke tamu.',
  streaming: 'Bagikan tautan live streaming acara untuk tamu yang hadir online.',
  story: 'Ceritakan perjalanan kisah cinta pasangan.',
  instagramStory: 'Atur hashtag dan filter Instagram Story untuk acaramu.',
  quote: 'Kutipan atau pesan pembuka yang tampil di awal undangan.',
  whatsapp: 'Susun template pesan untuk mengirim undangan ke tamu via WhatsApp.',
};
const coupleDesc = (eventType: string) => eventType === 'birthday' ? 'Isi data orang yang berulang tahun beserta pesannya.'
  : eventType === 'aqiqah' ? 'Lengkapi profil bayi dan orang tua sebagai pengundang.'
  : eventType === 'khitanan' ? 'Lengkapi profil anak yang dikhitan dan orang tua pengundang.'
  : eventType === 'tasyakuran' ? 'Isi data tuan rumah dan detail syukuran yang digelar.'
  : eventType === 'corporate' ? 'Isi identitas penyelenggara, PIC, dan deskripsi acara.'
  : SECTION_DESC.couple!;
// B-032: a memorial is described in its own words, never as a thanksgiving.
const MEMORIAL_DESC: Partial<Record<Tab, string>> = {
  couple: 'Nama yang dikenang dan keluarga yang mengundang. Semua teks di undangan ditulis sendiri oleh keluarga.',
  events: 'Tambahkan malam tahlilan, doa bersama, atau acara lain: nama, tanggal, waktu, lokasi, dan tautan Maps.',
};
const sectionDesc = (tab: Tab, eventType: string, memorial = false) =>
  (memorial ? MEMORIAL_DESC[tab] : undefined) ?? (tab === 'couple' ? coupleDesc(eventType) : SECTION_DESC[tab]);

// Per-type module allowlist. A module id listed here is HIDDEN for that event
// type — both from the sidebar nav and the Control Center grid. Derived from the
// cross-type matrix in the field spec (Oracle research). 'couple' and 'settings'
// are always shown; 'couple' is relabelled per type via profileLabel.
const HIDDEN_MODULES_BY_TYPE: Record<string, Tab[]> = {
  wedding: [],
  birthday: ['story', 'instagramStory', 'gift'],
  aqiqah: ['story', 'instagramStory'],
  tasyakuran: ['story', 'instagramStory', 'gift'],
  khitanan: ['story', 'instagramStory'],
  corporate: ['story', 'instagramStory', 'gift', 'music', 'greetings'],
};
const moduleVisible = (eventType: string, id: Tab) => {
  // 'theme' (Tema & Cover) is shown for every invitation (B-005). It used to be gated
  // on config.addons.theme, a key the strict schema rejects, so it never appeared.
  // The cover is editable here; the template itself is chosen in the catalog, so
  // switching never bypasses the tier checkout charges for (switching = B-036).
  if (id === 'theme') return true;
  // 'eventPlanner' is internal event-prep, not part of the public invitation.
  // It lives in its own sidebar section (/dashboard/planner), never in the editor.
  if (id === 'eventPlanner') return false;
  return !(HIDDEN_MODULES_BY_TYPE[eventType] ?? []).includes(id);
};

// Content contract (lib/invitation/content-contract.ts): tell hosts which inputs are saved but not yet shown on the
// guest page, so an editor field never pretends to change the invitation when it does not.
function notShownToGuests(tab: Tab, eventType: string) {
  const section = sectionForEditorTab(tab, eventType);
  return section ? storedOnlyNotice(section, 'id')?.wholeSection === true : false;
}

function StoredOnlyBanner({ tab, eventType, locale }: { tab: Tab; eventType: string; locale: 'id' | 'en' }) {
  const section = sectionForEditorTab(tab, eventType);
  const notice = section ? storedOnlyNotice(section, locale) : null;
  if (!notice) return null;
  const en = locale === 'en';
  return (
    <div role="note" className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1 leading-6">
        {notice.wholeSection && <p>{en ? 'Saved, but this section is not shown on the guest page yet.' : 'Tersimpan, tetapi bagian ini belum tampil di halaman tamu.'}</p>}
        {notice.fields.length > 0 && <p>{en ? 'Saved but not shown to guests yet: ' : 'Tersimpan tetapi belum tampil ke tamu: '}{notice.fields.join(', ')}.</p>}
        {notice.caveat && <p className="font-medium">{notice.caveat}</p>}
      </div>
    </div>
  );
}

// D-040: `purpose="child-photo"` stores the upload under `protected/`, served to the owner's session only; guests reach it
// through their personal link's photo route. B-026: `purpose="gift-qris"` does the same for the host's QRIS image.
function ImageUpload({ label, value, onChange, invitationId, hint, purpose, accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml' }: { label: string; value?: string; onChange: (url: string) => void; invitationId: number; hint?: string; purpose?: 'child-photo' | 'gift-qris'; accept?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function pick(file: File) {
    setErr(''); setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file); if (purpose) fd.append('purpose', purpose);
      const r = await fetch(`/api/invitations/${invitationId}/upload`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error?.message || 'Gagal mengunggah. Coba lagi.'); return; }
      onChange(j.data.url);
    } catch { setErr('Gagal mengunggah. Coba lagi.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-1.5"><span className="text-xs font-semibold text-slate-700">{label}</span>
    <div className="flex items-center gap-3">
      {value ? <img src={value} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover" /> : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400"><ImagePlus className="h-5 w-5" /></div>}
      <div className="min-w-0 flex-1">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:border-brand-400 hover:bg-brand-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}<span>{busy ? 'Mengunggah…' : value ? 'Ganti gambar' : 'Unggah gambar'}</span>
          <input type="file" accept={accept} className="hidden" disabled={busy} onChange={e=>{const f=e.target.files?.[0]; if(f) pick(f); e.currentTarget.value='';}} />
        </label>
        {value && <button type="button" onClick={()=>onChange('')} className="ml-2 text-sm font-medium text-slate-400 transition hover:text-rose-600">Hapus</button>}
        <p className="mt-1 text-xs text-slate-400">{err ? <span className="text-rose-600">{err}</span> : (hint || 'PNG, JPG, WEBP, GIF, atau SVG • maks 5MB')}</p>
      </div>
    </div>
  </div>;
}
function Input({ label, value, onChange, placeholder, type='text' }: any) { return <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">{label}</span><input type={type} value={value ?? ''} placeholder={placeholder} onChange={e=>onChange(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100" /></label> }
function Area({ label, value, onChange, placeholder }: any) { return <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">{label}</span><textarea value={value ?? ''} placeholder={placeholder} onChange={e=>onChange(e.target.value)} className="min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100" /></label> }
function Toggle({ label, checked, onChange }: any) { return <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 text-sm font-medium"><span>{label}</span><input type="checkbox" checked={!!checked} onChange={e=>onChange(e.target.checked)} className="h-4 w-4 accent-brand-600" /></label> }
function Select({ label, value, onChange, options, placeholder='— pilih —' }: { label:string; value?:string; onChange:(v:string)=>void; options:[string,string][]; placeholder?:string }) { return <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">{label}</span><select value={value ?? ''} onChange={e=>onChange(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"><option value="">{placeholder}</option>{options.map(([val,lbl])=><option key={val} value={val}>{lbl}</option>)}</select></label> }
function Card({ title, children, desc }: any) { return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h2 className="font-bold text-slate-900">{title}</h2>{desc&&<p className="mt-1 text-sm text-slate-500">{desc}</p>}<div className="mt-5 space-y-4">{children}</div></section> }

export function InvitationEditor({ invitationId, previewHref, embedPreviewHref, eventType, locale, initialConfig, initialVersion, autosave, initialMedia, themeOptions, themeTier, paletteOptions, corpusOptions, guestLanguage, guestShare, cardExport, historyHref = null, guestPasscode = null, postEventMemory = false }: Props) {
  const themes = useMemo<ThemeChoices>(() => ({ options: themeOptions, tier: themeTier, palettes: paletteOptions }), [themeOptions, themeTier, paletteOptions]);
  const isBirthday = eventType === 'birthday';
  const isCeremony = ['aqiqah', 'tasyakuran', 'khitanan'].includes(eventType);
  const isCorporate = eventType === 'corporate';
  const [tab, setTab] = useState<Tab>('settings'); const [config, setConfig] = useState<Config>(initialConfig); const [media, setMedia] = useState(initialMedia); const [notice, setNotice] = useState('');
  const en=locale==='en';
  const patch=(key:string, value:any)=>setConfig((c:any)=>({...c,[key]:value}));
  const section=(key:string)=>config[key]||{};
  // B-035: every edit goes through one save loop (automatic under FLAG_EDITOR_AUTOSAVE, else the button), carrying the version it was based on.
  const save = useEditorSave({ invitationId, config, initialVersion, auto: autosave, en });
  const saving = save.snapshot.status === 'saving';
  const blocked = save.snapshot.status === 'conflict';
  // B-025: a gallery video is a media row too (`type: 'video'`); the guest page turns a YouTube or Vimeo link into a facade.
  async function addGallery(url:string, type:'photo'|'video'='photo'){ const next=(Math.max(0,...media.map(m=>m.uploadSequence||0))+1); const r=await fetch(`/api/invitations/${invitationId}/media`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,url,uploadSequence:next,source:'web'})}); if(r.ok){const x=await r.json();setMedia(m=>[...m,x.data]);}else setNotice(type==='video'?'URL video tidak valid / gagal disimpan.':'URL gambar tidak valid / gagal disimpan.'); }
  // B-032 (G-060): a memorial (tahlilan) is never labelled as a thanksgiving.
  const memorial = isMemorial(config);
  const profileLabel = memorial ? MEMORIAL_COPY.profileTab : isBirthday ? 'Yang berulang tahun' : eventType === 'aqiqah' ? 'Bayi & keluarga' : eventType === 'khitanan' ? 'Anak & keluarga' : eventType === 'tasyakuran' ? 'Tuan rumah & syukuran' : isCorporate ? 'Penyelenggara' : 'Pengantin';
  const eventLabel = memorial ? 'Rangkaian acara' : isBirthday ? 'Detail pesta' : eventType === 'aqiqah' ? 'Acara aqiqah' : eventType === 'khitanan' ? 'Acara khitanan' : eventType === 'tasyakuran' ? 'Rangkaian syukuran' : isCorporate ? 'Agenda acara' : 'Acara';
  const visibleModules = modules.filter(([id]) => moduleVisible(eventType, id)).map(([id, label]) => [id, id === 'couple' ? profileLabel : id === 'events' ? eventLabel : label] as const);
  const title = visibleModules.find(x=>x[0]===tab)?.[1];
  const onEdit = tab !== 'settings';
  const desc = onEdit ? sectionDesc(tab, eventType, memorial) : undefined;
  const wide = autosave && onEdit;
  const backButton = onEdit
    ? <button type="button" onClick={()=>{setTab('settings');setNotice('');}} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"><ChevronLeft className="h-4 w-4" />{en?'All features':'Semua fitur'}</button>
    : <Link href="/dashboard/invitations" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"><ChevronLeft className="h-4 w-4" />{en?'My invitations':'Undangan saya'}</Link>;
  const editMain = (
    <div className={wide ? 'min-w-0 flex-1' : 'mx-auto max-w-5xl min-w-0 p-4 lg:p-6'}>
      <ConflictBanner save={save} en={en} />
      <div className="mb-6 border-b border-slate-200 pb-4"><h1 className="text-2xl font-bold leading-tight text-slate-900">{title}</h1>{desc && <p className="mt-1.5 text-sm text-slate-500">{desc}</p>}</div>
      <StoredOnlyBanner tab={tab} eventType={eventType} locale={locale} />
      <EditorTab tab={tab} section={section} patch={patch} media={media} addGallery={addGallery} open={setTab} eventType={eventType} invitationId={invitationId} themes={themes} corpus={corpusOptions} memorial={memorial} guestLanguage={guestLanguage} guestShare={guestShare} cardExport={cardExport} guestPasscode={guestPasscode} postEventMemory={postEventMemory} />
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {notice ? <span role="alert" className="text-sm font-medium text-rose-700">{notice}</span> : <SaveStatus save={save} en={en} live={false} />}
        <div className="ml-auto flex items-center gap-2">
          {historyHref && <a href={historyHref} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"><History className="h-4 w-4" aria-hidden="true" />{en?'History':'Riwayat'}</a>}
          <a href={previewHref} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"><Eye className="h-4 w-4" />{en?'Preview':'Pratinjau'}<span className="sr-only">{en?' (opens in a new tab)':' (membuka tab baru)'}</span></a>
          <button type="button" onClick={save.flush} disabled={saving || blocked} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}{saving?(en?'Saving…':'Menyimpan…'):autosave?(en?'Save now':'Simpan sekarang'):(en?'Save':'Simpan')}</button>
        </div>
      </div>
    </div>
  );
  return <section className="min-h-full bg-slate-50/70">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"><div className={`mx-auto flex items-center gap-3 px-4 py-2.5 lg:px-6 ${wide ? 'max-w-[88rem]' : 'max-w-5xl'}`}>{backButton}<div className="ml-auto min-w-0"><SaveStatus save={save} en={en} compact /></div></div></header>
    {tab === 'settings'
      ? <div className="mx-auto max-w-5xl p-4 lg:p-6"><ConflictBanner save={save} en={en} /><div className="mb-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-bold text-slate-900">Mulai edit undangan</h1><p className="mt-2 text-sm text-slate-500">{autosave ? 'Pilih bagian yang ingin kamu lengkapi. Setiap perubahan tersimpan otomatis.' : 'Pilih bagian yang ingin kamu lengkapi. Setiap perubahan disimpan lewat tombol Simpan di bawah field.'}</p></div>{/* G-046: the editor's first screen also leads to the history, so an owner finds it without opening a section first. */}{historyHref && <a href={historyHref} className="inline-flex min-h-11 w-fit shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"><History className="h-4 w-4" aria-hidden="true" />{en?'Version history':'Riwayat versi'}</a>}</div></div>{notice&&<span role="alert" className="mb-4 inline-block rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{notice}</span>}<ControlCenter open={setTab} eventType={eventType} memorial={memorial} guestLanguage={guestLanguage} /></div>
      : wide ? <div className="mx-auto flex max-w-[88rem] items-start gap-6 p-4 lg:p-6">{editMain}<PreviewPane href={embedPreviewHref} version={save.snapshot.baseVersion} showCover={tab === 'theme'} en={en} /></div> : editMain}
  </section>;
}

function ControlCenter({ open, eventType, memorial = false, guestLanguage = false }: { open: (tab: Tab) => void; eventType: string; memorial?: boolean; guestLanguage?: boolean }) {
  type Item = [Tab, string, string, any];
  const isBirthday = eventType === 'birthday'; const isCeremony = ['aqiqah','tasyakuran','khitanan'].includes(eventType); const isCorporate = eventType === 'corporate';
  const person: Item = memorial ? ['couple', MEMORIAL_COPY.profileTab, 'Nama yang dikenang, keluarga, foto, dan pesan keluarga.', UsersRound] : isBirthday ? ['couple', 'Yang berulang tahun', 'Nama, usia, tanggal lahir, orang tua, foto, dan pesan.', PartyPopper] : eventType === 'aqiqah' ? ['couple','Bayi & keluarga','Nama bayi, orang tua, tanggal lahir, dan doa.', Heart] : eventType === 'khitanan' ? ['couple','Anak & keluarga','Nama anak, orang tua, usia, foto, dan pesan.', UserRound] : eventType === 'tasyakuran' ? ['couple','Tuan rumah & syukuran','Tuan rumah, keluarga, dan pesan syukur.', UsersRound] : isCorporate ? ['couple','Penyelenggara','Nama organisasi, PIC, logo, dan deskripsi acara.', UsersRound] : ['couple', 'Pengantin', 'Nama mempelai, orang tua, urutan anak, foto, dan Instagram.', Heart];
  const groups: Array<{ title: string; description: string; items: Item[] }> = [
    { title: 'Isi undangan', description: 'Informasi inti yang dibaca tamu di halaman undangan.', items: [
      person, ['events', memorial ? 'Rangkaian acara' : isBirthday ? 'Detail pesta' : eventType === 'aqiqah' ? 'Acara aqiqah' : eventType === 'khitanan' ? 'Acara khitanan' : eventType === 'tasyakuran' ? 'Rangkaian syukuran' : isCorporate ? 'Agenda acara' : 'Acara', 'Tanggal, waktu, lokasi, alamat, dan Maps.', CalendarDays],
      ['quote', 'Quote', 'Kutipan atau pesan pembuka.', Quote],
      ['story', 'Kisah cinta', 'Cerita perjalanan pasangan.', Heart] as Item,
    ] },
    { title: 'Tampilan & media', description: 'Atur kesan visual dan elemen pendukung undangan.', items: [
      ['theme', 'Tema & Cover', guestLanguage ? 'Tema, warna, bahasa tamu, gambar cover, dan headline.' : 'Tema, warna, gambar cover, dan headline.', Sparkles],
      ['gallery', 'Galeri', 'Foto dengan urutan upload yang terjaga.', Images],
      ['music', 'Musik', 'Musik latar undangan.', Music2],
      ['instagramStory', 'Instagram Story', 'Hashtag dan tautan filter.', Clapperboard],
      ['streaming', 'Streaming', 'Link live streaming acara.', Radio],
    ] },
    { title: 'Interaksi tamu', description: 'Bagian yang digunakan tamu saat menerima undangan.', items: [
      ['rsvp', 'RSVP', 'Konfirmasi kehadiran dan batas waktu.', UsersRound],
      ['greetings', 'Ucapan & Doa', 'Kolom ucapan dari pengunjung.', MessageCircleHeart],
      ['gift', 'Kado', 'Rekening, e-wallet, atau alamat hadiah.', Gift],
      ['guestbook', 'Buku Tamu', 'Judul, pengantar, dan moderasi ucapan.', FileText],
      ['whatsapp', 'WhatsApp', 'Template pesan untuk kirim ke tamu.', MessageSquareText],
    ] },
  ];
  const visibleGroups = groups.map(g => ({ ...g, items: g.items.filter(([id]) => moduleVisible(eventType, id)) })).filter(g => g.items.length > 0);
  return <div className="space-y-8">{visibleGroups.map((group) => <section key={group.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 border-b border-slate-100 pb-4"><h2 className="text-base font-bold text-slate-900">{group.title}</h2><p className="mt-1 text-sm text-slate-500">{group.description}</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{group.items.map(([tab, title, description, Icon]) => <button type="button" onClick={() => open(tab)} key={tab} className="group min-h-36 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-left transition hover:border-brand-400 hover:bg-brand-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"><div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg border border-brand-100 bg-white text-brand-600"><Icon className="h-5 w-5" /></span><span aria-hidden className="text-lg text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600">→</span></div><h3 className="mt-4 font-bold text-slate-900 group-hover:text-brand-700">{title}{notShownToGuests(tab, eventType) && <span className="ml-2 inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 align-middle text-xs font-semibold text-amber-800">Belum tampil</span>}</h3><p className="mt-1 text-sm leading-5 text-slate-500">{description}</p></button>)}</div></section>)}</div>
}

function EditorTab({tab,section,patch,media,addGallery,open,eventType,invitationId,themes,corpus,memorial,guestLanguage,guestShare,cardExport,guestPasscode,postEventMemory}:{tab:Tab;section:any;patch:any;media:Asset[];addGallery:(url:string,type?:'photo'|'video')=>void;open:(tab:Tab)=>void;eventType:string;invitationId:number;themes:ThemeChoices;corpus:CorpusOption[];memorial:boolean;guestLanguage:boolean;guestShare:boolean;cardExport:boolean;guestPasscode:{enabled:boolean;setAt:string|null}|null;postEventMemory:boolean}){
 const isBirthday=eventType==='birthday'; const isCeremony=['aqiqah','tasyakuran','khitanan'].includes(eventType); const isCorporate=eventType==='corporate';
 const v=section(tab==='whatsapp'?'whatsappTemplate':tab);
 if(tab==='settings') return <ControlCenter open={open} eventType={eventType} memorial={memorial} />;
 if(tab==='couple' && isCorporate) { const x=section('corporateProfile'); const cats:[string,string][]=[['gathering','Gathering'],['product_launch','Peluncuran produk'],['seminar','Seminar'],['conference','Konferensi'],['webinar','Webinar'],['gala_award','Gala / Award'],['rups','RUPS'],['training','Pelatihan'],['other','Lainnya']]; return <Card title="Penyelenggara" desc="Identitas perusahaan dan kontak PIC acara."><div className="grid gap-4 md:grid-cols-2"><Input label="Nama organisasi" value={x.organizationName} onChange={(z:string)=>patch('corporateProfile',{...x,organizationName:z})}/><Input label="Nama acara" value={x.eventName} onChange={(z:string)=>patch('corporateProfile',{...x,eventName:z})}/><Select label="Kategori acara" value={x.eventCategory} options={cats} onChange={(z:string)=>patch('corporateProfile',{...x,eventCategory:z||undefined})}/><Input label="Dress code" value={x.dressCode} onChange={(z:string)=>patch('corporateProfile',{...x,dressCode:z})}/><Input label="Nama PIC" value={x.contactName} onChange={(z:string)=>patch('corporateProfile',{...x,contactName:z})}/><Input label="Nomor PIC" value={x.contactPhone} onChange={(z:string)=>patch('corporateProfile',{...x,contactPhone:z})}/><Input label="Email PIC" value={x.contactEmail} onChange={(z:string)=>patch('corporateProfile',{...x,contactEmail:z})}/><div className="md:col-span-2"><ImageUpload label="Logo perusahaan" hint="Logo melebar atau persegi paling mudah dibaca (tinggi tampil 64 px, lebar sampai 240 px). Logo yang sangat tinggi akan tampil sempit." invitationId={invitationId} value={x.logoUrl} onChange={(z:string)=>patch('corporateProfile',{...x,logoUrl:z})}/></div></div><Area label="Deskripsi / tujuan acara" value={x.description} onChange={(z:string)=>patch('corporateProfile',{...x,description:z})}/></Card> }
 if(tab==='couple' && eventType==='aqiqah') { const x=section('ceremonyProfile'); return <Card title="Bayi & keluarga" desc="Profil bayi dan orang tua sebagai pengundang."><div className="grid gap-4 md:grid-cols-2"><Input label="Nama bayi" value={x.honoureeName} onChange={(z:string)=>patch('ceremonyProfile',{...x,honoureeName:z})}/><Input label="Arti nama (opsional)" value={x.nameMeaning} onChange={(z:string)=>patch('ceremonyProfile',{...x,nameMeaning:z})}/><Select label="Jenis kelamin" value={x.gender} options={[['male','Laki-laki'],['female','Perempuan']]} onChange={(z:string)=>patch('ceremonyProfile',{...x,gender:z||undefined})}/><Input label="Anak ke-" type="number" value={x.childOrder} onChange={(z:string)=>patch('ceremonyProfile',{...x,childOrder:z?Number(z):undefined})}/><Input label="Nama ayah" value={x.fatherName} onChange={(z:string)=>patch('ceremonyProfile',{...x,fatherName:z})}/><Input label="Nama ibu" value={x.motherName} onChange={(z:string)=>patch('ceremonyProfile',{...x,motherName:z})}/><Input label="Tanggal lahir" type="date" value={x.birthDate} onChange={(z:string)=>patch('ceremonyProfile',{...x,birthDate:z})}/><Input label="Tempat lahir" value={x.birthPlace} onChange={(z:string)=>patch('ceremonyProfile',{...x,birthPlace:z})}/><Input label="Berat lahir" placeholder="3.2 kg" value={x.birthWeight} onChange={(z:string)=>patch('ceremonyProfile',{...x,birthWeight:z})}/><Input label="Panjang lahir" placeholder="49 cm" value={x.birthLength} onChange={(z:string)=>patch('ceremonyProfile',{...x,birthLength:z})}/><div className="md:col-span-2"><ImageUpload label="Foto bayi" purpose="child-photo" invitationId={invitationId} value={x.photoUrl} onChange={(z:string)=>patch('ceremonyProfile',{...x,photoUrl:z})}/>{/* D-038: a child's photo shows only with this switch, and only on guests' personal links. */}<div className="mt-3"><Toggle label="Tampilkan foto bayi di undangan (hanya untuk tamu yang membuka tautan pribadinya)" checked={x.showPhoto===true} onChange={(z:boolean)=>patch('ceremonyProfile',{...x,showPhoto:z||undefined})}/></div></div></div><Area label="Doa / harapan untuk bayi" value={x.prayer} onChange={(z:string)=>patch('ceremonyProfile',{...x,prayer:z})}/></Card> }
 if(tab==='couple' && eventType==='khitanan') { const x=section('ceremonyProfile'); return <Card title="Anak & keluarga" desc="Profil anak yang dikhitan dan orang tua pengundang."><div className="grid gap-4 md:grid-cols-2"><Input label="Nama anak" value={x.honoureeName} onChange={(z:string)=>patch('ceremonyProfile',{...x,honoureeName:z})}/><Input label="Nama panggilan" value={x.nickName} onChange={(z:string)=>patch('ceremonyProfile',{...x,nickName:z})}/><Input label="Usia anak" type="number" value={x.age} onChange={(z:string)=>patch('ceremonyProfile',{...x,age:z?Number(z):undefined})}/><Input label="Asal sekolah (opsional)" value={x.school} onChange={(z:string)=>patch('ceremonyProfile',{...x,school:z})}/><Input label="Nama ayah" value={x.fatherName} onChange={(z:string)=>patch('ceremonyProfile',{...x,fatherName:z})}/><Input label="Nama ibu" value={x.motherName} onChange={(z:string)=>patch('ceremonyProfile',{...x,motherName:z})}/><Input label="Tanggal khitan (opsional)" type="date" value={x.circumcisionDate} onChange={(z:string)=>patch('ceremonyProfile',{...x,circumcisionDate:z})}/><div className="md:col-span-2"><ImageUpload label="Foto anak" purpose="child-photo" invitationId={invitationId} value={x.photoUrl} onChange={(z:string)=>patch('ceremonyProfile',{...x,photoUrl:z})}/><div className="mt-3"><Toggle label="Tampilkan foto anak di undangan (hanya untuk tamu yang membuka tautan pribadinya)" checked={x.showPhoto===true} onChange={(z:boolean)=>patch('ceremonyProfile',{...x,showPhoto:z||undefined})}/></div></div></div><Area label="Doa untuk kesehatan / pemulihan anak" value={x.prayer} onChange={(z:string)=>patch('ceremonyProfile',{...x,prayer:z})}/><Area label="Catatan (opsional)" value={x.recoveryNote} onChange={(z:string)=>patch('ceremonyProfile',{...x,recoveryNote:z})}/></Card> }
 // B-032 (G-060): a memorial asks for who is remembered and the family's own words, never the thanksgiving fields.
 if(tab==='couple' && memorial) { const x=section('ceremonyProfile'); return <Card title={MEMORIAL_COPY.profileTab} desc="Semua teks ditulis sendiri oleh keluarga; Invitesion tidak menambahkan doa atau ayat."><div className="grid gap-4 md:grid-cols-2"><Input label="Nama lengkap almarhum/almarhumah" value={x.honoureeName} onChange={(z:string)=>patch('ceremonyProfile',{...x,honoureeName:z})}/><Input label="Nama yang ditampilkan" placeholder="mis. Alm. Bapak Soedirman" value={x.nickName} onChange={(z:string)=>patch('ceremonyProfile',{...x,nickName:z})}/><div className="md:col-span-2"><Input label="Keluarga yang mengundang" placeholder="mis. Keluarga besar Bapak Soedirman" value={x.parents} onChange={(z:string)=>patch('ceremonyProfile',{...x,parents:z})}/></div><div className="md:col-span-2"><ImageUpload label="Foto (opsional)" invitationId={invitationId} value={x.photoUrl} onChange={(z:string)=>patch('ceremonyProfile',{...x,photoUrl:z})}/></div></div><Area label="Pesan keluarga" value={x.ceremonyNote} onChange={(z:string)=>patch('ceremonyProfile',{...x,ceremonyNote:z})}/></Card> }
 if(tab==='couple' && eventType==='tasyakuran') { const x=section('ceremonyProfile'); const cats:[string,string][]=[['housewarming','Rumah baru'],['promotion','Naik jabatan'],['graduation','Kelulusan / wisuda'],['new_business','Usaha baru'],['hajj_umrah','Haji / umrah'],['other','Lainnya']]; const achLabel=x.thanksgivingCategory==='housewarming'?'Alamat rumah baru':x.thanksgivingCategory==='promotion'?'Jabatan & instansi':x.thanksgivingCategory==='graduation'?'Institusi & gelar':x.thanksgivingCategory==='new_business'?'Nama / jenis usaha':'Pencapaian (opsional)'; return <Card title="Tuan rumah & syukuran" desc="Jenis syukuran menentukan field yang tampil."><div className="grid gap-4 md:grid-cols-2"><Select label="Jenis syukuran" value={x.thanksgivingCategory} options={cats} onChange={(z:string)=>patch('ceremonyProfile',{...x,thanksgivingCategory:z||undefined})}/><Input label="Judul acara" value={x.thanksgivingTitle} onChange={(z:string)=>patch('ceremonyProfile',{...x,thanksgivingTitle:z})}/><Input label="Nama tuan rumah / keluarga" value={x.honoureeName} onChange={(z:string)=>patch('ceremonyProfile',{...x,honoureeName:z})}/><Input label={achLabel} value={x.achievement} onChange={(z:string)=>patch('ceremonyProfile',{...x,achievement:z})}/><div className="md:col-span-2"><ImageUpload label="Foto (opsional)" invitationId={invitationId} value={x.photoUrl} onChange={(z:string)=>patch('ceremonyProfile',{...x,photoUrl:z})}/></div></div><Area label="Pesan syukur / doa" value={x.ceremonyNote} onChange={(z:string)=>patch('ceremonyProfile',{...x,ceremonyNote:z})}/></Card> }
 if(tab==='couple' && isBirthday) { const x=section('birthdayPerson'); return <Card title="Yang berulang tahun" desc="Data khusus untuk undangan ulang tahun."><div className="grid gap-4 md:grid-cols-2"><Input label="Nama lengkap" value={x.fullName} onChange={(z:string)=>patch('birthdayPerson',{...x,fullName:z})}/><Input label="Nama panggilan" value={x.nickName} onChange={(z:string)=>patch('birthdayPerson',{...x,nickName:z})}/><Input label="Tanggal lahir" type="date" value={x.birthDate} onChange={(z:string)=>patch('birthdayPerson',{...x,birthDate:z})}/><Input label="Usia" type="number" value={x.age} onChange={(z:string)=>patch('birthdayPerson',{...x,age:z?Number(z):undefined})}/><Input label="Nama orang tua" value={x.parents} onChange={(z:string)=>patch('birthdayPerson',{...x,parents:z})}/><Input label="Instagram" value={x.instagram} onChange={(z:string)=>patch('birthdayPerson',{...x,instagram:z})}/></div><ImageUpload label="Foto" purpose="child-photo" invitationId={invitationId} value={x.photoUrl} onChange={(z:string)=>patch('birthdayPerson',{...x,photoUrl:z})}/><Toggle label="Tampilkan foto di undangan (hanya untuk tamu yang membuka tautan pribadinya)" checked={x.showPhoto===true} onChange={(z:boolean)=>patch('birthdayPerson',{...x,showPhoto:z||undefined})}/><Area label="Pesan dari yang berulang tahun" value={x.message} onChange={(z:string)=>patch('birthdayPerson',{...x,message:z})}/></Card> }
 if(tab==='couple') return <div className="grid gap-4 md:grid-cols-2">{[['bride','Mempelai wanita','Putri','wanita'],['groom','Mempelai pria','Putra','pria']].map(([k,label,anak,ig])=>{const x=v[k]||{};return <Card key={k} title={label} desc={`Data ${label.toLowerCase()} yang tampil di undangan.`}><Input label="Nama lengkap" placeholder={ig==='wanita'?'mis. Siti Rahmawati':'mis. Ahmad Fauzi'} value={x.fullName} onChange={(z:string)=>patch('couple',{...v,[k]:{...x,fullName:z}})}/><Input label="Nama panggilan" placeholder={ig==='wanita'?'mis. Siti':'mis. Fauzi'} value={x.nickName} onChange={(z:string)=>patch('couple',{...v,[k]:{...x,nickName:z}})}/><Input label="Nama orang tua" placeholder={`mis. Bapak Budi & Ibu Ani`} value={x.parents} onChange={(z:string)=>patch('couple',{...v,[k]:{...x,parents:z}})}/><Input label={`${anak} ke-`} type="number" placeholder="mis. 2" value={x.order} onChange={(z:string)=>patch('couple',{...v,[k]:{...x,order:z?Number(z):undefined}})}/><Input label="Instagram" placeholder={`mis. @${ig}.wedding`} value={x.instagram} onChange={(z:string)=>patch('couple',{...v,[k]:{...x,instagram:z}})}/><ImageUpload label="Foto" hint="Foto potret terbaik. PNG/JPG/WEBP • maks 5MB" invitationId={invitationId} value={x.photoUrl} onChange={(z:string)=>patch('couple',{...v,[k]:{...x,photoUrl:z}})}/></Card>})}</div>;
 if(tab==='theme') return <div className="grid gap-4 md:grid-cols-2"><Card title="Tema" desc="Ganti tema katalog tanpa biaya selama masih di paket yang sama. Isi undangan, tata letak, dan cover tetap; harga aktivasi mengikuti tema yang kamu beli."><ThemeSwitch options={themes.options} tier={themes.tier} templateId={v.templateId} paletteId={v.paletteId} onPick={(o)=>patch('theme',{...v,templateId:o.id,paletteId:o.paletteId})}/><div className="mt-4 space-y-1.5"><Select label="Tata letak" value={v.familyId} placeholder="Klasik (tata letak saat ini)" options={FAMILY_IDS.map((id)=>[id, `${FAMILIES[id].name} · ${INTENDED_FOR_LABEL[FAMILIES[id].intendedFor].id}`])} onChange={(x:string)=>patch('theme',{...v,familyId:x||undefined})}/><p className="text-xs leading-5 text-slate-500">{familyOf(v.familyId)?.summary.id ?? 'Tata letak klasik dipakai sampai kamu memilih yang lain. Isi undangan tetap sama di setiap tata letak.'}</p></div><LayoutChoices familyId={familyOf(v.familyId)?.id} sectionOrder={v.sectionOrder} fontPairing={v.fontPairing} onChange={(next)=>patch('theme',{...v,...next})}/></Card><Card title="Warna" desc="Palet warna berlaku di semua tata letak. Isi undangan tidak berubah."><PaletteChoice options={themes.palettes} tier={themes.tier} paletteId={v.paletteId} onPick={(id:string)=>patch('theme',{...v,paletteId:id})}/></Card>{/* G-018: the guest page's language; always sent explicitly, because the save merge keeps a key a save leaves out. */}{guestLanguage && <Card title="Bahasa halaman tamu" desc="Bahasa untuk label, tanggal, dan pemberitahuan yang dibaca tamu."><GuestLanguageChoice value={section('settings').language} familyId={v.familyId} onChange={(x)=>patch('settings',{...section('settings'),language:x})}/></Card>}{/* G-035: the guest page's share actions and Story image; always sent as a boolean, because the save merge keeps a key a save leaves out. */}{guestShare && <Card title="Bagikan undangan" desc="Tombol bagikan, kirim lewat WhatsApp, dan gambar Status / Story di akhir halaman tamu."><GuestShareChoice value={section('settings').guestShare} familyId={v.familyId} onChange={(x)=>patch('settings',{...section('settings'),guestShare:x})}/></Card>}{/* G-055: printable cards and the public e-card, an explicit opt-in sent as a boolean like the share switch. */}{cardExport && <Card title="Kartu cetak & e-card" desc="Kartu A6 dengan kode QR ke undangan, untuk dicetak atau dikirim sebagai gambar."><CardExportChoice value={section('settings').cardExport} cardsHref={`/dashboard/invitations/${invitationId}/cards`} onChange={(x)=>patch('settings',{...section('settings'),cardExport:x})}/></Card>}{/* G-047: an access setting saved on its own request, outside the content (never versioned or restored). */}{guestPasscode && <Card title="Kode akses tamu" desc="Opsional. Tamu hanya melihat cover sampai memasukkan kode yang kamu bagikan."><GuestPasscodeChoice invitationId={invitationId} initial={guestPasscode}/></Card>}<Card title="Cover undangan">{(()=>{const c=v.cover||{};return <><ImageUpload label="Gambar cover" invitationId={invitationId} value={c.imageUrl} onChange={(x:string)=>patch('theme',{...v,cover:{...c,imageUrl:x||undefined}})}/><Input label="Headline" value={c.headline} onChange={(x:string)=>patch('theme',{...v,cover:{...c,headline:x}})}/></>})()}</Card></div>;
 if(tab==='events') { const arr=Array.isArray(v)?v:[]; /* D-036: each event keeps its id through edits and moves; a new one gets a fresh id, never its position. */ const move=(i:number,d:number)=>{ const j=i+d; if(j<0||j>=arr.length) return; const next=[...arr]; [next[i],next[j]]=[next[j],next[i]]; patch('events',next); }; const settings=section('settings'); return <Card title="Jadwal acara" desc={memorial?'Urutan bisa diubah; jawaban tamu per acara tetap melekat pada acaranya.':'Tambah akad, resepsi, atau acara lain. Urutan bisa diubah; jawaban tamu per acara tetap melekat pada acaranya.'}>{/* B-032: the countdown is the host's choice (memorials start with it off); always sent as a boolean, because the save merge keeps a key a save leaves out. */}<Toggle label="Tampilkan hitung mundur menuju acara pertama" checked={settings.countdown!==false} onChange={(x:boolean)=>patch('settings',{...settings,countdown:x})}/>{arr.map((e:any,i:number)=><div className="rounded-lg border p-3" key={e.id ?? i}><div className="grid gap-3 sm:grid-cols-2"><Input label="Nama acara" value={e.title} onChange={(x:string)=>patch('events',arr.map((a:any,j:number)=>j===i?{...a,title:x}:a))}/><Input label="Lokasi" value={e.venueName} onChange={(x:string)=>patch('events',arr.map((a:any,j:number)=>j===i?{...a,venueName:x}:a))}/><Input label="Waktu mulai (ISO)" placeholder="2026-08-01T10:00:00+07:00" value={e.startAt} onChange={(x:string)=>patch('events',arr.map((a:any,j:number)=>j===i?{...a,startAt:x}:a))}/><Input label="Link Maps" value={e.mapUrl} onChange={(x:string)=>patch('events',arr.map((a:any,j:number)=>j===i?{...a,mapUrl:x}:a))}/></div>{/* D-037: invite-only events are shown only to guests invited to them on the guest page. */}<div className="mt-3"><Toggle label="Khusus tamu tertentu (pilih tamunya di halaman Tamu)" checked={e.inviteOnly===true} onChange={(x:boolean)=>patch('events',arr.map((a:any,j:number)=>j===i?{...a,inviteOnly:x||undefined}:a))}/></div><div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={()=>move(i,-1)} disabled={i===0} aria-label={`Naikkan urutan ${e.title||'acara'}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"><ChevronUp className="h-4 w-4" aria-hidden="true"/></button><button type="button" onClick={()=>move(i,1)} disabled={i===arr.length-1} aria-label={`Turunkan urutan ${e.title||'acara'}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"><ChevronDown className="h-4 w-4" aria-hidden="true"/></button><button type="button" className="ml-auto text-xs font-bold text-red-600" onClick={()=>patch('events',arr.filter((_:any,j:number)=>j!==i))}>Hapus acara</button></div></div>)}<button type="button" onClick={()=>patch('events',[...arr,{id:newEventId(),title:'Acara baru'}])} className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-bold text-brand-700"><Plus className="h-4 w-4"/>Tambah acara</button></Card> }
 if(tab==='music') return <Card title="Musik latar" desc="Tamu membuka undangan dengan tombol Buka Undangan, dan musik mulai diputar saat itu. Tempel tautan langsung ke berkas audio (misalnya https://contoh.com/lagu.mp3) dan pastikan kamu berhak memakai lagunya."><Toggle label="Aktifkan musik" checked={v.enabled} onChange={(x:boolean)=>patch('music',{...v,enabled:x})}/><Input label="Judul lagu" value={v.title} onChange={(x:string)=>patch('music',{...v,title:x})}/><Input label="URL audio" placeholder="https://" value={v.assetUrl} onChange={(x:string)=>patch('music',{...v,assetUrl:x})}/><Toggle label="Putar saat undangan dibuka (matikan agar tamu memutarnya sendiri)" checked={v.autoplay!==false} onChange={(x:boolean)=>patch('music',{...v,autoplay:x})}/></Card>;
 if(tab==='greetings') { const pe=section('postEvent')||{}; /* I-21 (D-070): the memory is content (versioned, restorable, saved by either writer); photos are reviewed on their own page. */ return <div className="grid gap-4"><Card title="Ucapan & Doa"><Toggle label="Tampilkan kolom ucapan" checked={v.enabled!==false} onChange={(x:boolean)=>patch('greetings',{...v,enabled:x})}/><Area label="Doa / teks pengantar" value={v.prayer} onChange={(x:string)=>patch('greetings',{...v,prayer:x})}/></Card>{postEventMemory && <Card title="Kenangan setelah acara" desc="Opsional. Setelah acara terakhir selesai, tautan undangan yang sama menampilkan ucapan terima kasihmu dan foto dari tamu."><div className="space-y-4"><Toggle label="Tampilkan kenangan setelah acara" checked={pe.enabled===true} onChange={(x:boolean)=>patch('postEvent',{...pe,enabled:x})}/><Area label="Ucapan terima kasih" value={pe.message} onChange={(x:string)=>patch('postEvent',{...pe,message:x})}/><Toggle label="Tamu boleh mengirim foto dari tautan pribadinya" checked={pe.photos===true} onChange={(x:boolean)=>patch('postEvent',{...pe,photos:x})}/><p className="text-xs leading-5 text-slate-500">Tampil pada desain katalog (bukan tata letak klasik). Setiap foto tamu menunggu persetujuanmu sebelum tampil; tamu bisa menghapus fotonya sendiri.</p><a href={`/dashboard/invitations/${invitationId}/kenangan`} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 underline underline-offset-4">Tinjau foto tamu</a></div></Card>}</div>; }
 if(tab==='gift') {const a=v.accounts||[];return <Card title="Kado cashless"><Toggle label="Aktifkan kado" checked={v.enabled} onChange={(x:boolean)=>patch('gift',{...v,enabled:x})}/>{a.map((x:any,i:number)=><div key={i} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"><Input label="Bank/e-wallet" value={x.label} onChange={(z:string)=>patch('gift',{...v,accounts:a.map((q:any,j:number)=>j===i?{...q,label:z}:q)})}/><Input label="Nomor rekening" value={x.number} onChange={(z:string)=>patch('gift',{...v,accounts:a.map((q:any,j:number)=>j===i?{...q,number:z}:q)})}/><Input label="Atas nama" value={x.holder} onChange={(z:string)=>patch('gift',{...v,accounts:a.map((q:any,j:number)=>j===i?{...q,holder:z}:q)})}/><button className="text-left text-sm font-bold text-red-600" onClick={()=>patch('gift',{...v,accounts:a.filter((_:any,j:number)=>j!==i)})}>Hapus</button></div>)}<button onClick={()=>patch('gift',{...v,accounts:[...a,{kind:'bank',label:''}]})} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-bold"><Plus className="h-4 w-4"/>Tambah rekening</button>{/* B-026 (D-047): who sees the details, and the host's static QRIS image (a protected upload; no payment runs through Invitesion). */}<Toggle label="Tampilkan rekening dan QRIS hanya di tautan pribadi tamu" checked={v.personalOnly===true} onChange={(x:boolean)=>patch('gift',{...v,personalOnly:x})}/><p className="text-xs text-slate-500">Saat aktif, tautan undangan tanpa nama tamu hanya menampilkan pemberitahuan bahwa detail hadiah ada di tautan pribadi. Undangan baru otomatis aktif.</p><ImageUpload label="Gambar QRIS statis (opsional)" purpose="gift-qris" accept="image/png,image/jpeg,image/webp" hint="PNG, JPG, atau WEBP • maks 1MB. Unggah QRIS statis dari aplikasi bank atau e-wallet Anda." invitationId={invitationId} value={v.qrisImageUrl||undefined} onChange={(z:string)=>patch('gift',{...v,qrisImageUrl:z})}/></Card> }
   if(tab==='rsvp') return <Card title="RSVP"><Toggle label="Aktifkan RSVP" checked={v.enabled!==false} onChange={(x:boolean)=>patch('rsvp',{...v,enabled:x})}/><Toggle label="Konfirmasi per acara (tamu menjawab tiap acara, mulai dari 2 acara)" checked={v.perEvent===true} onChange={(x:boolean)=>patch('rsvp',{...v,perEvent:x})}/><Input label="Batas RSVP (ISO)" value={v.deadline} onChange={(x:string)=>patch('rsvp',{...v,deadline:x})}/><Input label="Maks. tamu per RSVP" type="number" value={v.maxGuestsPerRsvp} onChange={(x:string)=>patch('rsvp',{...v,maxGuestsPerRsvp:x?Number(x):undefined})}/></Card>;
 if(tab==='gallery') { const [url,setUrl]=[undefined,undefined] as any; return <Gallery media={media} add={addGallery} v={v} patch={patch}/> }
 if(tab==='guestbook') return <Card title="Buku Tamu" desc="Atur kolom ucapan yang pengunjung isi di undangan."><Toggle label="Aktifkan buku tamu" checked={v.enabled!==false} onChange={(x:boolean)=>patch('guestbook',{...v,enabled:x})}/><Input label="Judul bagian" placeholder="Buku Ucapan" value={v.heading} onChange={(x:string)=>patch('guestbook',{...v,heading:x})}/><Area label="Teks pengantar" placeholder="Tuliskan doa dan ucapan terbaikmu..." value={v.prompt} onChange={(x:string)=>patch('guestbook',{...v,prompt:x})}/><Toggle label="Tahan ucapan baru sampai saya setujui" checked={v.moderation} onChange={(x:boolean)=>patch('guestbook',{...v,moderation:x})}/><Toggle label="Hanya tuan rumah yang bisa membaca ucapan" checked={v.visibility==='host'} onChange={(x:boolean)=>patch('guestbook',{...v,visibility:x?'host':'public'})}/><p className="text-xs leading-relaxed text-slate-500">Setujui, sembunyikan, hapus, dan balas ucapan di menu Wishes pada control center undangan.</p></Card>;
 if(tab==='eventPlanner') {const items=v.checklist||[];return <Card title="Event Planner" desc="Detail persiapan internal acara; tidak tampil di undangan publik."><Toggle label="Aktifkan Event Planner" checked={v.enabled} onChange={(x:boolean)=>patch('eventPlanner',{...v,enabled:x})}/><div className="grid gap-3 sm:grid-cols-2"><Input label="Nama event" value={v.eventName} onChange={(x:string)=>patch('eventPlanner',{...v,eventName:x})}/><Input label="Nama koordinator" value={v.coordinatorName} onChange={(x:string)=>patch('eventPlanner',{...v,coordinatorName:x})}/><Input label="Nomor koordinator" value={v.coordinatorPhone} onChange={(x:string)=>patch('eventPlanner',{...v,coordinatorPhone:x})}/></div><Area label="Catatan event" value={v.notes} onChange={(x:string)=>patch('eventPlanner',{...v,notes:x})}/><div className="space-y-2">{items.map((x:any,i:number)=><label key={i} className="flex items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={x.done} onChange={e=>patch('eventPlanner',{...v,checklist:items.map((q:any,j:number)=>j===i?{...q,done:e.target.checked}:q)})} className="h-4 w-4 accent-brand-600"/><input value={x.title} onChange={e=>patch('eventPlanner',{...v,checklist:items.map((q:any,j:number)=>j===i?{...q,title:e.target.value}:q)})} className="min-w-0 flex-1 bg-transparent text-sm outline-none"/><button type="button" onClick={()=>patch('eventPlanner',{...v,checklist:items.filter((_:any,j:number)=>j!==i)})} className="text-xs font-bold text-red-600">Hapus</button></label>)}</div><button type="button" onClick={()=>patch('eventPlanner',{...v,enabled:true,checklist:[...items,{title:'',done:false}]})} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-bold"><Plus className="h-4 w-4"/>Tambah tugas</button></Card>}
 if(tab==='streaming') return <Card title="Live streaming"><Toggle label="Aktifkan streaming" checked={v.enabled} onChange={(x:boolean)=>patch('streaming',{...v,enabled:x})}/><Input label="Platform" value={v.platform} onChange={(x:string)=>patch('streaming',{...v,platform:x})}/><Input label="Link streaming" value={v.url} onChange={(x:string)=>patch('streaming',{...v,url:x})}/></Card>;
 if(tab==='story') {const a=v.items||[];return <Card title="Kisah cinta">{a.map((x:any,i:number)=><div key={i} className="rounded-lg border p-3"><Input label="Judul" value={x.title} onChange={(z:string)=>patch('story',{...v,items:a.map((q:any,j:number)=>j===i?{...q,title:z}:q)})}/><Area label="Cerita" value={x.body} onChange={(z:string)=>patch('story',{...v,items:a.map((q:any,j:number)=>j===i?{...q,body:z}:q)})}/></div>)}<button onClick={()=>patch('story',{...v,enabled:true,items:[...a,{title:'',body:''}]})} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-bold"><Plus className="h-4 w-4"/>Tambah kisah</button></Card>}
 if(tab==='instagramStory') return <Card title="Instagram Story"><Toggle label="Aktifkan Instagram Story" checked={v.enabled} onChange={(x:boolean)=>patch('instagramStory',{...v,enabled:x})}/><Input label="Hashtag" value={v.hashtag} onChange={(x:string)=>patch('instagramStory',{...v,hashtag:x})}/><Input label="URL filter" value={v.filterUrl} onChange={(x:string)=>patch('instagramStory',{...v,filterUrl:x})}/></Card>;
 if(tab==='quote') return <Card title="Quote"><Toggle label="Tampilkan quote" checked={v.enabled} onChange={(x:boolean)=>patch('quote',{...v,enabled:x})}/><Area label="Quote" value={v.text} onChange={(x:string)=>patch('quote',{...v,text:x})}/><Input label="Sumber" value={v.author} onChange={(x:string)=>patch('quote',{...v,author:x})}/>
   {/* I-11 (ADR-O04): religious text only as an owner-approved corpus entry, printed with its provenance; '' clears a reference (the save merge keeps a key a save leaves out). */}
   <Select label="Teks keagamaan terverifikasi (opsional)" value={v.corpusId||''} options={corpus.map(o=>[o.id,o.label] as [string,string])} placeholder={corpus.length?'Tidak memakai':'Belum ada teks yang disetujui'} onChange={(x:string)=>patch('quote',{...v,corpusId:x})}/>
   {/* D-041: the legacy layout is frozen and keeps showing only the typed quote, so the hint promises the entry on a design family alone (the renderer's own `familyOf` test). */}
   <p className="text-xs leading-relaxed text-slate-500">{!corpus.length?'Ayat, hadits, dan doa hanya bisa dipakai setelah disetujui pemilik Invitesion beserta sumbernya. Sampai ada, tulis kata-katamu sendiri di atas atau biarkan kosong.':familyOf(section('theme')?.familyId)?'Teks terpilih tampil persis seperti yang disetujui, dengan sumber dan pemeriksanya, menggantikan quote di atas.':'Tata letak klasik belum menampilkan teks terverifikasi: tamu hanya melihat quote yang kamu tulis di atas. Pilih tata letak lain di Tema & Cover untuk menampilkannya beserta sumber dan pemeriksanya.'}</p></Card>;
 return <Card title="Template WhatsApp" desc={'Pesan yang terisi saat Anda menekan WhatsApp di daftar tamu. Tulis {nama} untuk nama tamu dan {link} untuk tautan undangan personalnya; tanpa {link}, tautan ditambahkan di akhir pesan. Kosong: pesan bawaan.'}><Area label="Pesan WhatsApp" value={v} placeholder={'Halo {nama}, kami mengundang Anda ke acara kami. Undangan personal Anda: {link}'} onChange={(x:string)=>patch('whatsappTemplate',x)}/></Card>
}
// B-025 (G-028): the layout applies on the four design families (placeholder = each family's own grid); the classic
// layout keeps its grid (D-041). Photos and videos are separate media rows, so the thumbnails list photos only.
const GALLERY_LAYOUT_OPTIONS:[string,string][]=[['masonry','Masonry: foto bersusun dengan tinggi berbeda'],['carousel','Carousel: satu baris yang digeser']];
function Gallery({media,add,v,patch}:{media:Asset[];add:(url:string,type?:'photo'|'video')=>void;v:any;patch:any}){
  const [url,setUrl]=useState(''); const [videoUrl,setVideoUrl]=useState(''); const id=useId();
  const photos=media.filter(m=>m.type==='photo'); const videos=media.filter(m=>m.type==='video');
  return <Card title="Galeri" desc="Urutan tampilan mengikuti urutan upload, bukan nama file.">
    <Toggle label="Tampilkan galeri" checked={v.enabled!==false} onChange={(x:boolean)=>patch('gallery',{...v,enabled:x})}/>
    <div className="space-y-1.5"><Select label="Tata letak galeri" value={v.layout==='grid'?'':v.layout} placeholder="Grid bawaan desain" options={GALLERY_LAYOUT_OPTIONS} onChange={(z:string)=>patch('gallery',{...v,layout:z||undefined})}/><p className="text-xs text-slate-500">Berlaku untuk desain Gapura, Kartu, Riang, dan Lontar. Desain klasik selalu menampilkan grid.</p></div>
    <div className="space-y-1.5"><label htmlFor={`${id}-photo`} className="text-xs font-semibold text-slate-700">Tambah foto (tautan gambar)</label><div className="flex gap-2"><input id={`${id}-photo`} type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://... gambar" className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"/><button type="button" aria-label="Tambah foto" onClick={()=>{if(url){add(url);setUrl('')}}} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-slate-900 px-3 text-sm font-bold text-white"><ImagePlus className="h-4 w-4"/></button></div></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((m,i)=><div className="overflow-hidden rounded-lg border" key={m.id}><img className="h-24 w-full object-cover" src={m.url} alt={`Foto ${i+1}`}/><p className="px-2 py-1.5 text-xs font-semibold text-slate-600">Urutan upload #{m.uploadSequence}</p></div>)}</div>
    <div className="space-y-1.5"><label htmlFor={`${id}-video`} className="text-xs font-semibold text-slate-700">Tambah video (tautan YouTube atau Vimeo)</label><div className="flex gap-2"><input id={`${id}-video`} type="url" value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} placeholder="https://youtu.be/..." className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"/><button type="button" aria-label="Tambah video" onClick={()=>{if(videoUrl){add(videoUrl,'video');setVideoUrl('')}}} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-slate-900 px-3 text-sm font-bold text-white"><Video className="h-4 w-4"/></button></div><p className="text-xs text-slate-500">Video baru dimuat setelah tamu mengetuknya. Tautan selain YouTube dan Vimeo tampil sebagai tombol yang membuka videonya.</p></div>
    {videos.length>0&&<ul className="space-y-2">{videos.map((m,i)=><li key={m.id} className="rounded-lg border px-3 py-2 text-xs text-slate-600"><span className="font-semibold">Video {i+1}</span> <span className="break-all">{m.url}</span></li>)}</ul>}
  </Card>
}
