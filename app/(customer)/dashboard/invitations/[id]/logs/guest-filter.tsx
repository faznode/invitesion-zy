'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

/** Narrows the server-rendered guest rows by name in place; without JavaScript every row stays visible. */
export function GuestFilter() {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<number | null>(null);

  function filter(value: string) {
    setQuery(value);
    const needle = value.trim().toLowerCase();
    let count = 0;
    document.querySelectorAll<HTMLElement>('[data-guest-row]').forEach((row) => {
      const match = !needle || (row.dataset.name ?? '').includes(needle);
      row.hidden = !match;
      if (match) count++;
    });
    setShown(needle ? count : null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="relative block">
        <span className="sr-only">Cari nama tamu</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => filter(event.target.value)}
          placeholder="Cari nama tamu"
          className="h-11 w-full rounded-lg border pl-9 pr-3 text-sm outline-none focus:border-brand-700"
        />
      </label>
      <p aria-live="polite" className="text-xs text-slate-600">
        {shown === null ? '' : `${shown} tamu cocok`}
      </p>
    </div>
  );
}
