'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  Copy,
  Disc3,
  Home,
  Images,
  Instagram,
  MailOpen,
  MapPin,
  Users,
} from 'lucide-react';
import type { InvitationTemplate, TemplateCategory } from '@/lib/invitation/templates';
import { templateUseHref } from '@/lib/invitation/template-use-href';
import { getThemeArt } from '@/lib/invitation/theme-art';
import styles from './preview.module.css';
import artStyles from './art.module.css';

/**
 * Pengalaman preview undangan yang meniru undangan digital sungguhan:
 * gate “Buka Undangan” dengan nama tamu dari ?to=, hero beranimasi,
 * countdown live, tombol maps/kalender/salin, RSVP demo, dan bottom nav.
 */

type Locale = 'id' | 'en';

type Props = {
  template: InvitationTemplate;
  locale: Locale;
  guestName: string | null;
  /** B-037: `FLAG_CREATION_WIZARD`, read on the server; "Pakai tema ini" opens the wizard when on. */
  wizard?: boolean;
};

type SampleEvent = { title: string; time: string; venue: string; address: string };

const SAMPLE_EVENTS: Record<TemplateCategory, SampleEvent[]> = {
  wedding: [
    { title: 'Akad Nikah', time: 'SABTU · 09.00 – 10.30 WIB', venue: 'Masjid Agung Al-Azhar', address: 'Jl. Sisingamangaraja No. 1, Jakarta Selatan' },
    { title: 'Resepsi', time: 'SABTU · 11.30 – 14.00 WIB', venue: 'The Glass House, Pacific Place', address: 'Jl. Jend. Sudirman Kav. 52-53, Jakarta' },
  ],
  anniversary: [
    { title: 'Syukuran Hari Jadi', time: 'SABTU · 18.30 WIB', venue: 'Kediaman Keluarga', address: 'Jl. Cempaka No. 12, Bandung' },
  ],
  'bridal-shower': [
    { title: 'Bridal Shower', time: 'SABTU · 15.00 WIB', venue: 'Amara Tea House', address: 'Jl. Senopati No. 41, Jakarta Selatan' },
  ],
  birthday: [
    { title: 'Pesta Ulang Tahun', time: 'MINGGU · 16.00 WIB', venue: 'Taman Kota Playground', address: 'Jl. Melati No. 8, Depok' },
  ],
  'aqiqah-khitanan': [
    { title: 'Tasyakuran', time: 'MINGGU · 10.00 WIB', venue: 'Kediaman Keluarga', address: 'Jl. Anggrek No. 3, Bogor' },
  ],
  syukuran: [
    { title: 'Acara Syukuran', time: 'MINGGU · 11.00 WIB', venue: 'Kediaman Keluarga', address: 'Jl. Kenanga No. 17, Yogyakarta' },
  ],
  'baby-shower': [
    { title: 'Baby Shower', time: 'SABTU · 14.00 WIB', venue: 'Rumah Nenek', address: 'Jl. Flamboyan No. 5, Tangerang' },
  ],
  graduation: [
    { title: 'Perayaan Wisuda', time: 'KAMIS · 18.00 WIB', venue: 'Balai Sarbini', address: 'Jl. Jend. Sudirman, Jakarta' },
  ],
  reunion: [
    { title: 'Reuni Akbar', time: 'SABTU · 17.00 WIB', venue: 'Aula SMA 3', address: 'Jl. Pendidikan No. 21, Semarang' },
  ],
  'holiday-gathering': [
    { title: 'Kumpul Keluarga', time: 'MINGGU · 10.00 WIB', venue: 'Kediaman Keluarga Besar', address: 'Jl. Mawar No. 2, Surabaya' },
  ],
  corporate: [
    { title: 'Main Event', time: 'THURSDAY · 18.30 WIB', venue: 'Grand Ballroom, Hotel Indonesia Kempinski', address: 'Jl. M.H. Thamrin No. 1, Jakarta' },
  ],
  'gender-reveal': [
    { title: 'Gender Reveal Party', time: 'SABTU · 16.00 WIB', venue: 'Kediaman Keluarga', address: 'Jl. Kenari No. 9, Depok' },
  ],
  tahlilan: [
    { title: 'Tahlil & Doa Bersama', time: 'KAMIS · 19.30 WIB', venue: 'Kediaman Keluarga', address: 'Jl. Cendrawasih No. 14, Malang' },
  ],
  retirement: [
    { title: 'Acara Pelepasan Purnabakti', time: 'JUMAT · 14.00 WIB', venue: 'Aula Kantor Pusat', address: 'Jl. Gatot Subroto No. 20, Jakarta' },
  ],
  'product-launch': [
    { title: 'Grand Launching', time: 'RABU · 18.00 WIB', venue: 'The Kasablanka Hall', address: 'Jl. Casablanca Raya, Jakarta Selatan' },
  ],
  conference: [
    { title: 'Opening Keynote', time: 'THURSDAY · 09.00 WIB', venue: 'JCC Senayan, Assembly Hall', address: 'Jl. Jend. Gatot Subroto, Jakarta' },
  ],
  tradeshow: [
    { title: 'Expo Floor Opens', time: 'FRIDAY · 10.00 WIB', venue: 'ICE BSD, Hall 5', address: 'BSD City, Tangerang' },
  ],
  'sales-kickoff': [
    { title: 'Kickoff Main Session', time: 'SENIN · 09.00 WIB', venue: 'Ritz-Carlton Ballroom', address: 'Jl. Mega Kuningan, Jakarta' },
  ],
  workshop: [
    { title: 'Sesi Workshop', time: 'SABTU · 13.00 WIB', venue: 'Ruang Kreatif Comma', address: 'Jl. Kemang Raya No. 8, Jakarta Selatan' },
  ],
  networking: [
    { title: 'Networking Mixer', time: 'FRIDAY · 19.00 WIB', venue: 'Skye Rooftop', address: 'Jl. M.H. Thamrin No. 1, Jakarta' },
  ],
  'team-building': [
    { title: 'Team Offsite', time: 'SABTU · 08.00 WIB', venue: 'Taman Safari Camp Ground', address: 'Cisarua, Bogor' },
  ],
  'investor-meeting': [
    { title: 'Annual Shareholders Meeting', time: 'TUESDAY · 10.00 WIB', venue: 'Menara BCA, Boardroom Lt. 40', address: 'Jl. M.H. Thamrin No. 1, Jakarta' },
  ],
  gala: [
    { title: 'Gala Dinner', time: 'SATURDAY · 19.00 WIB', venue: 'Grand Ballroom, Mulia Senayan', address: 'Jl. Asia Afrika, Jakarta' },
  ],
  'client-vip': [
    { title: 'VIP Appreciation Night', time: 'THURSDAY · 18.30 WIB', venue: 'Private Dining, Fairmont Jakarta', address: 'Jl. Asia Afrika No. 8, Jakarta' },
  ],
  'employee-appreciation': [
    { title: 'Night of Champions', time: 'FRIDAY · 18.00 WIB', venue: 'Balai Kartini', address: 'Jl. Gatot Subroto Kav. 37, Jakarta' },
  ],
  shows: [
    { title: 'Malam Pertunjukan', time: 'SABTU · 19.30 WIB', venue: 'Ciputra Artpreneur Theatre', address: 'Jl. Prof. Dr. Satrio, Jakarta' },
  ],
  'community-event': [
    { title: 'Festival Komunitas', time: 'MINGGU · 09.00 WIB', venue: 'Lapangan Warga RW 05', address: 'Jl. Kenanga Raya No. 1, Bekasi' },
  ],
};

const SAMPLE_STORY = [
  { date: '1 Mei 2019', title: 'Bertemu', body: 'Dipertemukan lewat teman lama di sebuah acara — obrolan singkat yang ternyata tidak pernah selesai.' },
  { date: '30 April 2025', title: 'Lamaran', body: 'Di tempat yang sama saat pertama bertemu, sebuah pertanyaan sederhana dijawab dengan air mata bahagia.' },
  { date: '12 Desember 2026', title: 'Menikah', body: 'Dengan restu kedua keluarga, kami melangkah ke babak baru — dan kamu diundang menjadi saksinya.' },
];

type Wish = { name: string; text: string; badge?: string };

const SAMPLE_WISHES: Wish[] = [
  { name: 'Raisa & Keluarga', text: 'Selamat! Semoga acaranya lancar dan penuh berkah. Kami usahakan hadir ya!', badge: 'Hadir' },
  { name: 'Teman Kantor', text: 'Turut berbahagia! Sehat-sehat selalu dan sampai jumpa di hari H.', badge: 'Hadir' },
];

// 12 Desember 2026, 09.00 WIB — tanggal contoh yang deterministik (aman untuk SSR).
const EVENT_TS = Date.UTC(2026, 11, 12, 2, 0, 0);

// URL dirakit dari potongan agar tidak dirusak oleh linkifier saat transfer file.
const GCAL_URL = ['https:', '//www.google.com/calendar/render?'].join('');
const GMAPS_URL = ['https:', '//www.google.com/maps?q='].join('');
const IG_URL = ['https:', '//instagram.com'].join('');

export default function PreviewClient({ template, locale, guestName, wizard = false }: Props) {
  const [opened, setOpened] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [wishes, setWishes] = useState<Wish[]>(SAMPLE_WISHES);
  const [formName, setFormName] = useState('');
  const [formAttend, setFormAttend] = useState('hadir');
  const [formCount, setFormCount] = useState('2');
  const [formMessage, setFormMessage] = useState('');
  const [sent, setSent] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const t =
    locale === 'en'
      ? {
          back: 'All themes',
          use: 'Use this theme',
          dear: 'Dear Mr/Mrs/Ms',
          guestFallback: 'Guest Name',
          place: 'at their residence',
          open: 'Open Invitation',
          coupleTitle: 'Bride & Groom',
          hostsTitle: 'Your Hosts',
          roles: ['The Bride', 'The Groom'],
          daughterOf: 'First daughter of',
          sonOf: 'Youngest son of',
          parents: 'Mr. & Mrs. Sample Family',
          events: 'Save The Date',
          maps: 'Open Maps',
          counting: 'Counting the days',
          days: 'Days', hours: 'Hours', mins: 'Mins', secs: 'Secs',
          saveCal: 'Save to Calendar',
          gallery: 'Our Gallery',
          gallerySub: 'Constantly, consistently, continually — you.',
          story: 'Our Story',
          gift: 'Wedding Gift',
          giftSub: 'Your presence is enough — but if you wish to send a gift:',
          copy: 'Copy', copied: 'Copied',
          rsvp: 'RSVP & Wishes',
          name: 'Full name',
          attendance: 'Attendance',
          attendOpts: [['hadir', 'Attending'], ['tidak', 'Not attending'], ['ragu', 'Maybe']] as const,
          guests: 'Party size',
          person: 'person(s)',
          message: 'Your wishes',
          send: 'Send (demo)',
          sent: 'Sent! In a real invitation this goes straight to the guestbook.',
          demoNote: 'Live demo — RSVP and guestbook are stored for real once your invitation is created.',
          closing: 'It would be an honor and joy for us if you would attend and share your blessings.',
          closingKicker: 'WITH LOVE',
          nav: { home: 'Home', couple: 'Couple', events: 'Events', gallery: 'Gallery', rsvp: 'RSVP' },
          music: 'Music plays on real invitations — tap to toggle the demo disc.',
        }
      : {
          back: 'Semua tema',
          use: 'Pakai tema ini',
          dear: 'Kepada Yth. Bpk/Ibu/Saudara/i',
          guestFallback: 'Nama Tamu',
          place: 'di tempat',
          open: 'Buka Undangan',
          coupleTitle: 'Mempelai',
          hostsTitle: 'Tuan Rumah',
          roles: ['Mempelai Wanita', 'Mempelai Pria'],
          daughterOf: 'Putri pertama dari',
          sonOf: 'Putra bungsu dari',
          parents: 'Bpk. Mempelai & Ibu Mempelai',
          events: 'Rangkaian Acara',
          maps: 'Buka Maps',
          counting: 'Menghitung hari',
          days: 'Hari', hours: 'Jam', mins: 'Menit', secs: 'Detik',
          saveCal: 'Simpan di Kalender',
          gallery: 'Galeri Kami',
          gallerySub: 'Selalu, senantiasa, selamanya — kamu.',
          story: 'Kisah Kami',
          gift: 'Kado & Tanda Kasih',
          giftSub: 'Kehadiranmu sudah cukup — namun jika ingin mengirim tanda kasih:',
          copy: 'Salin', copied: 'Tersalin',
          rsvp: 'RSVP & Ucapan',
          name: 'Nama lengkap',
          attendance: 'Konfirmasi kehadiran',
          attendOpts: [['hadir', 'Hadir'], ['tidak', 'Tidak Hadir'], ['ragu', 'Masih Ragu']] as const,
          guests: 'Jumlah tamu',
          person: 'orang',
          message: 'Doa & ucapan',
          send: 'Kirim (demo)',
          sent: 'Terkirim! Di undangan asli, ucapan langsung masuk buku tamu.',
          demoNote: 'Ini demo langsung — RSVP dan buku tamu tersimpan sungguhan setelah undangan kamu dibuat.',
          closing: 'Merupakan suatu kebahagiaan dan kehormatan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir dan memberikan doa restu.',
          closingKicker: 'KAMI YANG BERBAHAGIA',
          nav: { home: 'Beranda', couple: 'Mempelai', events: 'Acara', gallery: 'Galeri', rsvp: 'RSVP' },
          music: 'Musik berputar di undangan asli — klik untuk coba piringannya.',
        };

  const preset = template.preset;
  const useHref = templateUseHref(template.slug, wizard);
  const events = SAMPLE_EVENTS[template.category];
  const artwork = useMemo(() => getThemeArt(template), [template]);
  const partners = useMemo(
    () => template.sample.names.split('&').map((part) => part.trim()).filter(Boolean),
    [template.sample.names],
  );
  const isCouple = partners.length === 2;
  const isWedding = template.category === 'wedding';

  const vars = {
    '--bg': template.palette.bg,
    '--ink': template.palette.ink,
    '--a': template.palette.accent,
    '--s': template.palette.soft,
  } as CSSProperties;

  // Kunci scroll selama gate tertutup.
  useEffect(() => {
    document.body.style.overflow = opened ? '' : 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [opened]);

  // Reveal saat elemen masuk viewport.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.shown = 'true';
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Countdown live (mulai setelah mount agar bebas hydration mismatch).
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = now === null ? 0 : Math.max(0, EVENT_TS - now);
  const countdown = [
    { label: t.days, value: Math.floor(left / 86_400_000) },
    { label: t.hours, value: Math.floor(left / 3_600_000) % 24 },
    { label: t.mins, value: Math.floor(left / 60_000) % 60 },
    { label: t.secs, value: Math.floor(left / 1_000) % 60 },
  ];

  const calUrl = useMemo(() => {
    const date = new Date(EVENT_TS);
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}0000Z`;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${template.sample.eyebrow} — ${template.sample.names}`,
      location: events[0].venue,
      dates: `${stamp}/${stamp}`,
    });
    return GCAL_URL + params.toString();
  }, [template.sample.eyebrow, template.sample.names, events]);

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      setTimeout(() => setCopiedValue(null), 1600);
    } catch {
      /* clipboard tidak tersedia — abaikan di demo */
    }
  };

  const submitRsvp = (event: FormEvent) => {
    event.preventDefault();
    if (!formMessage.trim()) return;
    const badge = t.attendOpts.find(([value]) => value === formAttend)?.[1];
    setWishes((prev) => [
      { name: formName.trim() || guestName || t.guestFallback, text: formMessage.trim(), badge },
      ...prev,
    ]);
    setFormMessage('');
    setSent(true);
    setTimeout(() => setSent(false), 3200);
  };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  const gifts = [
    { label: 'BCA', number: '4210 8812 3456', holder: `a.n. ${partners[1] ?? partners[0] ?? 'Pemilik Undangan'}` },
    { label: 'GoPay · OVO', number: '0812 3456 7890', holder: `a.n. ${partners[0] ?? 'Pemilik Undangan'}` },
  ];

  const navItems = [
    { id: 'beranda', label: t.nav.home, icon: <Home size={17} aria-hidden="true" /> },
    ...(isCouple ? [{ id: 'mempelai', label: t.nav.couple, icon: <Users size={17} aria-hidden="true" /> }] : []),
    { id: 'acara', label: t.nav.events, icon: <CalendarDays size={17} aria-hidden="true" /> },
    ...(preset.gallery?.enabled ? [{ id: 'galeri', label: t.nav.gallery, icon: <Images size={17} aria-hidden="true" /> }] : []),
    { id: 'rsvp', label: t.nav.rsvp, icon: <MailOpen size={17} aria-hidden="true" /> },
  ];

  return (
    <div
      ref={rootRef}
      className={styles.stage}
      style={vars}
      data-font={template.font}
      data-opened={opened ? 'true' : undefined}
    >
      {/* Gate “Buka Undangan” */}
      <div className={styles.gate} data-open={opened ? 'true' : undefined} aria-hidden={opened}>
        <div className={styles.scene} data-motif={template.motif}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={artStyles.artBg} src={artwork.cover} alt="" aria-hidden="true" />
          <span className={artStyles.artTint} aria-hidden="true" />
          <i className={styles.petals} aria-hidden="true" />
          <span className={styles.frame} aria-hidden="true" />
          <div className={styles.gateInner}>
            <p className={styles.cEyebrow}>{template.sample.eyebrow}</p>
            <h1 className={styles.gNames}>{template.sample.names}</h1>
            <p className={styles.cDate}>{template.sample.date}</p>
            <div className={styles.gTo}>
              <span>{t.dear}</span>
              <strong className={styles.gGuest}>{guestName ?? t.guestFallback}</strong>
              <span>{t.place}</span>
            </div>
            <button
              type="button"
              className={styles.gBtn}
              onClick={() => {
                setOpened(true);
                setPlaying(true);
              }}
            >
              <MailOpen size={15} aria-hidden="true" /> {t.open}
            </button>
          </div>
        </div>
      </div>

      <Link href="/templates" className={styles.chipBack}>
        <ArrowLeft size={14} aria-hidden="true" /> {t.back}
      </Link>
      <Link href={useHref} className={styles.chipUse}>
        {t.use} <ArrowUpRight size={14} aria-hidden="true" />
      </Link>

      <main className={styles.invite}>
        {/* Hero */}
        <section id="beranda" className={`${styles.scene} ${styles.hero}`} data-motif={template.motif}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={artStyles.artBg} src={artwork.cover} alt="" aria-hidden="true" />
          <span className={artStyles.artTint} aria-hidden="true" />
          <i className={styles.petals} aria-hidden="true" />
          <span className={styles.frame} aria-hidden="true" />
          <p className={styles.cEyebrow}>{template.sample.eyebrow}</p>
          <h2 className={styles.cNames}>{template.sample.names}</h2>
          <p className={styles.cDate}>{template.sample.date}</p>
          <span className={styles.scrollHint} aria-hidden="true">▾</span>
        </section>

        {/* Pembuka */}
        {preset.settings?.openingCopy ? (
          <section className={`${styles.section} ${styles.reveal}`} data-reveal>
            {preset.greetings?.prayer ? <p className={styles.prayer}>{preset.greetings.prayer}</p> : null}
            <p className={styles.opening}>{preset.settings.openingCopy}</p>
          </section>
        ) : null}

        {/* Quote */}
        {preset.quote?.enabled && preset.quote.text ? (
          <section className={`${styles.section} ${styles.reveal}`} data-reveal>
            <p className={styles.quoteText}>“{preset.quote.text}”</p>
            {preset.quote.author ? <p className={styles.quoteAuthor}>{preset.quote.author}</p> : null}
          </section>
        ) : null}

        {/* Mempelai */}
        {isCouple ? (
          <section id="mempelai" className={`${styles.section} ${styles.reveal}`} data-reveal>
            <h2 className={styles.sTitle}>{isWedding ? t.coupleTitle : t.hostsTitle}</h2>
            <div className={styles.couple}>
              {partners.map((partner, index) => (
                <div key={partner}>
                  <div className={styles.avatar} aria-hidden="true">{partner.charAt(0)}</div>
                  {isWedding ? <p className={styles.pRole}>{t.roles[index]}</p> : null}
                  <h3 className={styles.pName}>{partner}</h3>
                  {isWedding ? (
                    <p className={styles.pParents}>
                      {index === 0 ? t.daughterOf : t.sonOf}
                      <br />
                      {t.parents}
                    </p>
                  ) : null}
                  <a className={styles.igChip} href={IG_URL} target="_blank" rel="noreferrer">
                    <Instagram size={13} aria-hidden="true" /> Instagram
                  </a>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Acara + countdown */}
        <section id="acara" className={`${styles.section} ${styles.reveal}`} data-reveal>
          <h2 className={styles.sTitle}>{t.events}</h2>
          <p className={styles.sSub}>{t.counting}</p>
          <div className={styles.countWrap}>
            {countdown.map((box) => (
              <div key={box.label} className={styles.countBox}>
                <span className={styles.countNum}>{String(box.value).padStart(2, '0')}</span>
                <span className={styles.countLabel}>{box.label}</span>
              </div>
            ))}
          </div>
          <a className={styles.calBtn} href={calUrl} target="_blank" rel="noreferrer">
            <CalendarDays size={14} aria-hidden="true" /> {t.saveCal}
          </a>
          <div style={{ height: 26 }} aria-hidden="true" />
          {events.map((item) => (
            <div key={item.title} className={styles.eventCard}>
              <h3 className={styles.eventTitle}>{item.title}</h3>
              <p className={styles.eventTime}>{item.time}</p>
              <p className={styles.eventVenue}>{item.venue}</p>
              <p className={styles.eventAddr}>{item.address}</p>
              <a
                className={styles.mapBtn}
                href={GMAPS_URL + encodeURIComponent(`${item.venue} ${item.address}`)}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin size={13} aria-hidden="true" /> {t.maps}
              </a>
            </div>
          ))}
        </section>

        {/* Galeri */}
        {preset.gallery?.enabled ? (
          <section id="galeri" className={`${styles.section} ${styles.reveal}`} data-reveal>
            <h2 className={styles.sTitle}>{t.gallery}</h2>
            <p className={styles.sSub}>{t.gallerySub}</p>
            <div className={styles.gallery}>
              {artwork.gallery.map((src, index) => (
                <div key={`${src}-${index}`} className={`${styles.ph} ${artStyles.phClip}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={artStyles.phImg} src={src} alt="" loading="lazy" />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Kisah */}
        {preset.story?.enabled ? (
          <section className={`${styles.section} ${styles.reveal}`} data-reveal>
            <h2 className={styles.sTitle}>{t.story}</h2>
            <div className={styles.timeline}>
              {SAMPLE_STORY.map((item) => (
                <div key={item.title} className={styles.tItem}>
                  <p className={styles.tDate}>{item.date}</p>
                  <p className={styles.tTitle}>{item.title}</p>
                  <p className={styles.tBody}>{item.body}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Kado */}
        {preset.gift?.enabled ? (
          <section className={`${styles.section} ${styles.reveal}`} data-reveal>
            <h2 className={styles.sTitle}>{t.gift}</h2>
            <p className={styles.sSub}>{t.giftSub}</p>
            {gifts.map((gift) => (
              <div key={gift.label} className={styles.giftCard}>
                <p className={styles.giftLabel}>{gift.label}</p>
                <p className={styles.giftNumber}>{gift.number}</p>
                <p className={styles.giftHolder}>{gift.holder}</p>
                <button type="button" className={styles.copyBtn} onClick={() => copyValue(gift.number)}>
                  {copiedValue === gift.number ? (
                    <><Check size={13} aria-hidden="true" /> {t.copied}</>
                  ) : (
                    <><Copy size={13} aria-hidden="true" /> {t.copy}</>
                  )}
                </button>
              </div>
            ))}
          </section>
        ) : null}

        {/* RSVP & Ucapan */}
        <section id="rsvp" className={`${styles.section} ${styles.reveal}`} data-reveal>
          <h2 className={styles.sTitle}>{t.rsvp}</h2>
          <form className={styles.rsvpForm} onSubmit={submitRsvp}>
            <label className={styles.fLabel}>
              {t.name}
              <input
                className={styles.fInput}
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder={guestName ?? t.guestFallback}
              />
            </label>
            <span className={styles.fLabel}>
              {t.attendance}
              <span className={styles.choiceRow}>
                {t.attendOpts.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={formAttend === value ? `${styles.choice} ${styles.choiceOn}` : styles.choice}
                    onClick={() => setFormAttend(value)}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </span>
            <label className={styles.fLabel}>
              {t.guests}
              <select
                className={styles.fSelect}
                value={formCount}
                onChange={(event) => setFormCount(event.target.value)}
              >
                {['1', '2', '3', '4', '5'].map((count) => (
                  <option key={count} value={count}>
                    {count} {t.person}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.fLabel}>
              {t.message}
              <textarea
                className={styles.fTextarea}
                value={formMessage}
                onChange={(event) => setFormMessage(event.target.value)}
                placeholder="..."
              />
            </label>
            <button type="submit" className={styles.submitBtn}>
              {t.send}
            </button>
          </form>
          {sent ? <p className={styles.demoNote}>{t.sent}</p> : <p className={styles.demoNote}>{t.demoNote}</p>}
          <div className={styles.wishes}>
            {wishes.map((wish, index) => (
              <div key={`${wish.name}-${index}`} className={styles.wish}>
                <p className={styles.wishName}>
                  {wish.name}
                  {wish.badge ? <span className={styles.wishBadge}>{wish.badge}</span> : null}
                </p>
                <p className={styles.wishText}>{wish.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Penutup */}
        <section className={`${styles.section} ${styles.reveal}`} data-reveal>
          <p className={styles.closing}>{t.closing}</p>
          <p className={styles.closingKicker}>{t.closingKicker}</p>
          <p className={styles.closingNames}>{template.sample.names}</p>
        </section>

        <footer className={styles.footer}>Undangan digital oleh Invitesion</footer>
      </main>

      <button
        type="button"
        className={styles.musicBtn}
        data-on={playing ? 'true' : undefined}
        onClick={() => setPlaying((value) => !value)}
        title={t.music}
        aria-label={t.music}
      >
        <Disc3 size={20} className={styles.musicIcon} aria-hidden="true" />
      </button>

      <nav className={styles.nav} aria-label="Navigasi undangan">
        {navItems.map((item) => (
          <button key={item.id} type="button" className={styles.navBtn} onClick={() => scrollTo(item.id)}>
            {item.icon}
            <span className={styles.navLabel}>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
