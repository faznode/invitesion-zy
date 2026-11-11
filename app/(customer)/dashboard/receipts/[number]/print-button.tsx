'use client';

import { Printer } from 'lucide-react';

/** Opens the browser's print dialog, where the receipt can also be saved as a PDF. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <Printer className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
