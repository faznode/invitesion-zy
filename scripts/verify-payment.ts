/**
 * End-to-end check of the payment domain against the real database.
 *
 * Proves the properties unit tests cannot: that a settlement actually activates
 * an invitation, that replaying a delivery does nothing the second time, and
 * that an underpayment is refused rather than accepted.
 *
 * Run against a scratch database:
 *   npx tsx scripts/verify-payment.ts
 *
 * `server-only` is neutralised below because the payment service is correctly
 * marked server-only for the bundler's benefit, which otherwise makes it
 * unreachable from any script. This is the seam every future domain script will
 * need.
 */
import Module from 'node:module';

const load = (Module as unknown as { _load: (r: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {};
  return load.call(this, request, ...rest);
};

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const { eq } = await import('drizzle-orm');
  const { db, client } = await import('@/lib/db/drizzle');
  const { invitations, orders, paymentEvents, users } = await import('@/lib/db/schema');
  const { applySettlement, newReference } = await import('@/lib/payment/service');
  const { money } = await import('@/lib/payment/money');

  const [customer] = await db.select().from(users).where(eq(users.role, 'CUSTOMER')).limit(1);
  if (!customer) throw new Error('No CUSTOMER user found. Run pnpm db:seed first.');

  const [invitation] = await db
    .insert(invitations)
    .values({
      userId: customer.id,
      slug: `pay-check-${Date.now().toString(36)}`,
      eventType: 'wedding',
      status: 'DRAFT',
      config: {},
    })
    .returning();

  const reference = newReference();
  await db.insert(orders).values({
    userId: customer.id,
    invitationId: invitation.id,
    tier: 'standard',
    amount: 149_000,
    currency: 'IDR',
    rail: 'qris',
    reference,
    status: 'PENDING',
  });

  const event = {
    rail: 'qris' as const,
    eventId: `verify-${reference}`,
    reference,
    providerPaymentId: 'verify-payment-1',
    status: 'PAID' as const,
    paid: money(149_000, 'IDR'),
    raw: { source: 'verify-script' },
  };

  const first = await applySettlement(event);
  check('settlement applies', first.applied === true);
  check('payment activates the invitation', first.applied && first.invitationActivated === true);

  const [activated] = await db.select().from(invitations).where(eq(invitations.id, invitation.id));
  check('invitation is PUBLISHED', activated.status === 'PUBLISHED', activated.status);
  const months =
    activated.expiresAt && activated.publishedAt
      ? (activated.expiresAt.getFullYear() - activated.publishedAt.getFullYear()) * 12 +
        (activated.expiresAt.getMonth() - activated.publishedAt.getMonth())
      : -1;
  check('active window is 12 months', months === 12, `${months}`);

  // A provider retry of the identical delivery.
  const replay = await applySettlement(event);
  check('replayed delivery is a no-op', replay.applied === false && replay.reason === 'duplicate');

  const rows = await db.select().from(paymentEvents).where(eq(paymentEvents.eventId, event.eventId));
  check('exactly one event row recorded', rows.length === 1, `${rows.length}`);

  // A different delivery for an order that is already final.
  const late = await applySettlement({ ...event, eventId: `${event.eventId}-late` });
  check('a second distinct event cannot re-pay', late.applied === false && late.reason === 'already-final');

  const [order] = await db.select().from(orders).where(eq(orders.reference, reference));
  check('order paid exactly once', order.status === 'PAID' && order.paidAt !== null);

  // An amount that disagrees with the order.
  const shortRef = newReference();
  await db.insert(orders).values({
    userId: customer.id,
    invitationId: null,
    tier: 'standard',
    amount: 149_000,
    currency: 'IDR',
    rail: 'qris',
    reference: shortRef,
    status: 'PENDING',
  });
  let rejected = false;
  try {
    await applySettlement({ ...event, eventId: `short-${shortRef}`, reference: shortRef, paid: money(1_000, 'IDR') });
  } catch (error) {
    rejected = (error as Error).name === 'AmountMismatchError';
  }
  check('underpayment is refused', rejected);
  const [untouched] = await db.select().from(orders).where(eq(orders.reference, shortRef));
  check('underpaid order stays PENDING', untouched.status === 'PENDING', untouched.status);

  await client.end();
}

main()
  .catch((error) => {
    console.error('FAIL  unexpected error:', error);
    failures++;
  })
  .finally(() => {
    console.log(failures === 0 ? '\nAll payment checks passed.' : `\n${failures} check(s) FAILED.`);
    process.exit(failures === 0 ? 0 : 1);
  });
