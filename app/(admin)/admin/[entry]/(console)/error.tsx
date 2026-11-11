'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Dashboard error'); }, []);
  return <div className="flex min-h-[70vh] items-center justify-center p-6"><div className="max-w-md rounded-xl border bg-white p-8 text-center shadow-sm"><h2 className="text-lg font-semibold">Panel mengalami kendala</h2><p className="mt-2 text-sm text-muted-foreground">Data gagal dimuat. Coba ulang tanpa keluar dari panel admin.</p><Button className="mt-6 bg-brand-600" onClick={() => reset()}>Coba lagi</Button></div></div>;
}
