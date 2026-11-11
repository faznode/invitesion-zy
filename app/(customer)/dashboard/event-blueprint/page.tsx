import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import EventBlueprintPicker from './picker';

export default async function EventBlueprintPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');
  return <EventBlueprintPicker />;
}
