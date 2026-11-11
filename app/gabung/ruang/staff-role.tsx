import { Check, Minus } from 'lucide-react';
import { WORKSPACE_ROLE_COPY, type WorkspaceRole } from '@/lib/invitation/members';

/** What the workspace role allows and withholds, so the visitor knows what they accept before they accept it. */
export function StaffRoleSummary({ role, workspaceName }: { role: WorkspaceRole; workspaceName: string }) {
  const copy = WORKSPACE_ROLE_COPY[role];
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ruang kerja</p>
        <p className="break-words text-base font-semibold text-foreground">{workspaceName}</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Peran</p>
        <p className="text-base font-semibold text-foreground">{copy.name}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.summary}</p>
      </div>
      <ul className="flex flex-col gap-2 text-sm leading-relaxed">
        {copy.can.map((line) => (
          <li key={line} className="flex gap-2 text-foreground">
            <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
        {copy.cannot.map((line) => (
          <li key={line} className="flex gap-2 text-muted-foreground">
            <Minus className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="sr-only">Tidak termasuk: </span>
              {line}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const STAFF_JOIN_REFUSALS: Record<'invalid' | 'owner' | 'member' | 'admin', { title: string; body: string }> = {
  invalid: {
    title: 'Tautan ini tidak berlaku',
    body: 'Tautan staf hanya bisa dipakai satu akun, berlaku 7 hari, dan bisa dibatalkan pemilik ruang kerja. Minta tautan baru kepada pemilik ruang kerja.',
  },
  owner: { title: 'Ini ruang kerja Anda sendiri', body: 'Pemilik ruang kerja sudah memegang semua undangan kliennya, jadi tidak perlu bergabung sebagai staf.' },
  member: {
    title: 'Anda sudah staf di ruang kerja ini',
    body: 'Akun ini sudah memegang peran di ruang kerja tersebut. Bila perlu peran lain, minta pemiliknya mencabut akses lama lebih dulu.',
  },
  admin: { title: 'Akun administrator tidak bisa bergabung', body: 'Masuk dengan akun pelanggan untuk bergabung dengan ruang kerja.' },
};
