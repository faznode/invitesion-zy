import { redirect } from 'next/navigation';

// Event Planner is scoped to one invitation. Choose it from that invitation's card.
export default function LegacyPlannerIndex() {
  redirect('/dashboard/invitations');
}
