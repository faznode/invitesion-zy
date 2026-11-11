import Link from 'next/link';
import { CircleIcon } from 'lucide-react';
import { getLocale } from '@/lib/locale-server';

export default async function NotFound() {
  const en = (await getLocale()) === 'en';
  return <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6"><section className="max-w-md text-center"><CircleIcon className="mx-auto h-10 w-10 text-brand-600" /><p className="mt-6 text-sm font-semibold text-brand-700">404</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{en ? 'Page not found' : 'Halaman tidak ditemukan'}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{en ? 'The address may be incorrect or the page is no longer available.' : 'Alamat mungkin keliru atau halaman sudah tidak tersedia.'}</p><Link href="/" className="mt-7 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">{en ? 'Back to home' : 'Kembali ke beranda'}</Link></section></main>;
}
