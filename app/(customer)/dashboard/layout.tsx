import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { getLocale } from '@/lib/locale-server';
import { CustomerShell } from './customer-shell';

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [locale, user] = await Promise.all([getLocale(), getUser()]);
  return (
    <CustomerShell locale={locale} user={user} receiptsEnabled={isFlagOn('RECEIPTS')} workspacesEnabled={isFlagOn('WORKSPACES')}>
      {children}
    </CustomerShell>
  );
}
