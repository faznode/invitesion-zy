import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getLocale } from '@/lib/locale-server';
import { updateCustomerProfile } from './actions';

const ERROR_KEYS = ['invalid', 'email', 'phone', 'avatar', 'duplicate'] as const;
type ErrorKey = (typeof ERROR_KEYS)[number];

function errorMessage(key: string | undefined, en: boolean): string | null {
  if (!key || !ERROR_KEYS.includes(key as ErrorKey)) return null;
  const map: Record<ErrorKey, [string, string]> = {
    invalid: ['Please check your entries. Name needs at least 2 characters and a valid email.', 'Periksa lagi isian kamu. Nama minimal 2 karakter dan email harus valid.'],
    email: ['That email is already used by another account.', 'Email itu sudah dipakai akun lain.'],
    phone: ['That phone number is already used by another account.', 'Nomor telepon itu sudah dipakai akun lain.'],
    avatar: ['Photo must be an image under 2 MB.', 'Foto harus berupa gambar maksimal 2 MB.'],
    duplicate: ['Could not save. Make sure your email and phone are not used by another account.', 'Gagal menyimpan. Pastikan email dan nomor tidak dipakai akun lain.'],
  };
  return en ? map[key as ErrorKey][0] : map[key as ErrorKey][1];
}

export default async function CustomerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  const en = (await getLocale()) === 'en';
  const q = await searchParams;
  const error = errorMessage(q.error, en);
  const initials = (user.name || user.email).slice(0, 1).toUpperCase();

  return (
    <section className="min-h-full bg-slate-50/70 p-4 lg:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-sm font-semibold text-brand-700">{en ? 'Account' : 'Akun'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{en ? 'Profile settings' : 'Pengaturan profil'}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {en
              ? 'Keep your contact details up to date so we can reach you about orders and support.'
              : 'Jaga data kontakmu tetap terbaru supaya kami mudah menghubungi soal pesanan dan bantuan.'}
          </p>
        </header>

        {q.saved && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {en ? 'Your changes have been saved.' : 'Perubahan berhasil disimpan.'}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <form action={updateCustomerProfile} className="space-y-6">
          <section className="rounded-xl border bg-white p-5 shadow-sm lg:p-6">
            <h2 className="text-base font-bold text-slate-900">{en ? 'Photo & identity' : 'Foto & identitas'}</h2>
            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-2xl font-bold text-brand-700">
                {user.avatarUrl ? <img src={user.avatarUrl} alt={en ? 'Profile photo' : 'Foto profil'} className="h-full w-full object-cover" /> : initials}
              </div>
              <label className="block flex-1 space-y-2">
                <span className="text-sm font-semibold text-slate-800">{en ? 'Upload profile photo' : 'Unggah foto profil'}</span>
                <input
                  name="avatar"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="block w-full rounded-lg border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-brand-700"
                />
                <span className="block text-xs text-slate-500">{en ? 'JPG, PNG, or WebP. Max 2 MB.' : 'JPG, PNG, atau WebP. Maksimum 2 MB.'}</span>
              </label>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-5 shadow-sm lg:p-6">
            <h2 className="text-base font-bold text-slate-900">{en ? 'Contact details' : 'Data kontak'}</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field icon="👤" label={en ? 'Full name' : 'Nama lengkap'} name="name" value={user.name} required />
              <Field icon="✉️" label="Email" name="email" value={user.email} type="email" required />
              <Field icon="📱" label={en ? 'Phone' : 'Telepon'} name="phone" value={user.phone} placeholder="08xxxxxxxxxx" />
              <Field icon="💬" label="WhatsApp" name="whatsapp" value={user.whatsapp} placeholder="08xxxxxxxxxx" />
              <Field icon="📷" label="Instagram" name="instagram" value={user.instagram} placeholder="@username" />
              <Field icon="🐦" label="X" name="xHandle" value={user.xHandle} placeholder="@username" />
            </div>
          </section>

          <section className="rounded-xl border bg-white p-5 shadow-sm lg:p-6">
            <label className="flex items-start gap-3">
              <input type="checkbox" name="marketingConsent" defaultChecked={user.marketingConsent} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-200" />
              <span className="text-sm text-slate-600">
                {en
                  ? 'Send me occasional tips and offers about my invitation. I can opt out anytime.'
                  : 'Kirimi saya tips dan penawaran sesekali tentang undangan. Bisa berhenti kapan saja.'}
              </span>
            </label>
          </section>

          <div className="flex justify-end">
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400">
              {en ? 'Save changes' : 'Simpan perubahan'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function Field({
  icon,
  label,
  name,
  value,
  type = 'text',
  placeholder,
  required,
}: {
  icon: string;
  label: string;
  name: string;
  value?: string | null;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <span className="flex h-11 items-center rounded-lg border bg-white px-3 shadow-sm focus-within:ring-2 focus-within:ring-brand-200">
        <span className="mr-2 text-base" aria-hidden>{icon}</span>
        <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" name={name} type={type} defaultValue={value || ''} placeholder={placeholder} required={required} />
      </span>
    </label>
  );
}

export const dynamic = 'force-dynamic';
