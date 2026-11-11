import { redirect } from 'next/navigation';

/** Legacy profile route: account settings live in one canonical page. */
export default async function ProfilePage({ params }: { params: Promise<{ entry: string }> }) {
  const { entry } = await params;
  redirect(`/admin/${entry}/general`);
}

export const dynamic = 'force-dynamic';
