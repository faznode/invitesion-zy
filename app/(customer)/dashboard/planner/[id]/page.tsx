import { redirect } from 'next/navigation';

export default async function LegacyPlannerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/invitations/${id}/planner`);
}
