/**
 * Database-backed proof of B-041 (s26, E-054; D-042) and B-036 (s32, E-072; D-054) against a scratch database: the config
 * writer refuses a theme the invitation's package does not include and lets the host switch catalog themes within it,
 * through the real catalog, checkout tier and settlement.
 *
 *   POSTGRES_URL=postgres://postgres@127.0.0.1:5433/invitesion npx tsx scripts/verify-theme-entitlement.ts
 *
 * Needs a CUSTOMER row (pnpm db:seed) and the theme catalog (pnpm db:seed:templates). Scenarios:
 * - a Standard invitation, published by a settled Standard order, cannot take a Premium palette, and the refused write
 *   leaves the stored config and the version history untouched;
 * - it keeps saving other theme fields, may take another Standard palette, and refuses unknown palettes;
 * - B-036: it switches to another Standard catalog theme (catalog id and palette) with every other section, the purchased
 *   theme (`invitations.template_id`), the published status and the payment unchanged and no new order, so publishing
 *   and checkout still see it paid; a Premium catalog theme and an id the catalog does not know (a `templates` row id is
 *   one) are refused with nothing written;
 * - after a settled Premium order for it, the Premium palette and a Premium catalog theme are accepted;
 * - an unpaid Standard draft cannot take a Premium palette or theme (it would be charged Standard) but may switch to
 *   another Standard theme; a Premium draft may take a Premium palette.
 * Every row it creates is removed at the end.
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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
}

type CatalogTheme = { id: number; isPremium: boolean; catalogId: number; paletteId: string };

async function main() {
  const { and, count, eq, inArray } = await import('drizzle-orm');
  const { db, client } = await import('@/lib/db/drizzle');
  const { invitations, invitationVersions, orders, paymentEvents, payments, receipts, templates, users } = await import('@/lib/db/schema');
  const { createInvitation } = await import('@/lib/invitation/create');
  const { ThemeEntitlementError, updateDetailConfig } = await import('@/lib/invitation/service');
  const { catalogThemeTier, paletteTier } = await import('@/lib/invitation/theme-entitlement');
  const { applySettlement, hasPaidOrder, newReference } = await import('@/lib/payment/service');
  const { money } = await import('@/lib/payment/money');
  const { activationPrice, tierFor } = await import('@/lib/pricing');

  const [customer] = await db.select().from(users).where(eq(users.role, 'CUSTOMER')).limit(1);
  if (!customer) throw new Error('No CUSTOMER user found. Run pnpm db:seed first.');
  // A `templates` row has its own serial id; the config names the catalog id its preset carries (D-054).
  const rows = await db.select({ id: templates.id, isPremium: templates.isPremium, defaultConfig: templates.defaultConfig }).from(templates);
  const catalog: CatalogTheme[] = rows.flatMap((row) => {
    const theme = ((row.defaultConfig ?? {}) as { theme?: { templateId?: unknown; paletteId?: unknown } }).theme ?? {};
    return typeof theme.templateId === 'number' && typeof theme.paletteId === 'string'
      ? [{ id: row.id, isPremium: row.isPremium, catalogId: theme.templateId, paletteId: theme.paletteId }]
      : [];
  });
  const freeTheme = catalog.find((template) => !template.isPremium);
  const otherFree = catalog.find((template) => !template.isPremium && template.id !== freeTheme?.id);
  const premiumTheme = catalog.find((template) => template.isPremium);
  if (!freeTheme || !otherFree || !premiumTheme) throw new Error('Theme catalog missing. Run pnpm db:seed:templates first.');
  check('the database tier of each catalog theme is the catalog rule the writers apply', catalog.every((t) => catalogThemeTier(t.catalogId) === tierFor(t.isPremium)), `${catalog.length} themes`);

  const createdInvitations: number[] = [];
  const createdOrders: number[] = [];

  async function settle(invitationId: number, templateId: number, isPremium: boolean) {
    const price = activationPrice(isPremium);
    const reference = newReference();
    const [order] = await db
      .insert(orders)
      .values({ userId: customer.id, invitationId, templateId, tier: tierFor(isPremium), amount: price.amount, currency: price.currency, rail: 'qris', reference, status: 'PENDING' })
      .returning({ id: orders.id });
    createdOrders.push(order.id);
    return applySettlement({
      rail: 'qris',
      eventId: `theme-check-${reference}`,
      reference,
      providerPaymentId: null,
      status: 'PAID',
      paid: money(price.amount, price.currency),
      raw: { source: 'verify-theme-entitlement' },
    });
  }

  async function stored(invitationId: number) {
    const [row] = await db
      .select({ config: invitations.config, templateId: invitations.templateId, status: invitations.status })
      .from(invitations)
      .where(eq(invitations.id, invitationId));
    const [{ value }] = await db.select({ value: count() }).from(invitationVersions).where(eq(invitationVersions.invitationId, invitationId));
    const [{ value: orderRows }] = await db.select({ value: count() }).from(orders).where(eq(orders.invitationId, invitationId));
    const { theme = {}, ...rest } = (row.config ?? {}) as { theme?: Record<string, unknown> } & Record<string, unknown>;
    return { theme, rest: JSON.stringify(rest), versions: value, templateId: row.templateId, status: row.status, orders: orderRows };
  }

  async function attempt(invitationId: number, theme: Record<string, unknown>) {
    try {
      await updateDetailConfig(invitationId, customer.id, { theme } as never);
      return { ok: true as const, reasons: [] as string[] };
    } catch (error) {
      if (error instanceof ThemeEntitlementError) return { ok: false as const, reasons: error.issues.map((issue) => issue.reason) };
      throw error;
    }
  }

  try {
    const standardInvitation = await createInvitation({ userId: customer.id, eventType: 'wedding', templateId: freeTheme.id, title: 'theme check standard' });
    createdInvitations.push(standardInvitation.id);
    const settled = await settle(standardInvitation.id, freeTheme.id, false);
    check('a settled Standard order publishes the Standard invitation', settled.applied && settled.invitationActivated === true);

    const before = await stored(standardInvitation.id);
    const ownPalette = String(before.theme.paletteId ?? '');
    check("the invitation starts on its catalog theme's Standard palette", paletteTier(ownPalette) === 'standard', ownPalette);
    check('its config names the catalog id, its row the templates id', before.theme.templateId === freeTheme.catalogId && before.templateId === freeTheme.id);

    const premiumPalette = await attempt(standardInvitation.id, { ...before.theme, paletteId: 'midnight' });
    check('published Standard → Premium palette is refused', !premiumPalette.ok && premiumPalette.reasons.includes('premium-palette'));
    const afterRefusal = await stored(standardInvitation.id);
    check('the refused write leaves the stored palette', afterRefusal.theme.paletteId === ownPalette, String(afterRefusal.theme.paletteId));
    check('the refused write adds no version', afterRefusal.versions === before.versions, `${before.versions} → ${afterRefusal.versions}`);

    const unknown = await attempt(standardInvitation.id, { ...before.theme, paletteId: 'neon' });
    check('an unknown palette is refused', !unknown.ok && unknown.reasons.includes('unknown-palette'));

    const layoutOnly = await attempt(standardInvitation.id, { ...before.theme, familyId: 'gapura' });
    const afterLayout = await stored(standardInvitation.id);
    check('saving another theme field with the stored palette still works', layoutOnly.ok && afterLayout.theme.familyId === 'gapura');
    check('that save adds one version', afterLayout.versions === before.versions + 1, `${before.versions} → ${afterLayout.versions}`);

    // B-036 (D-054): a switch within the paid tier.
    const toStandard = await attempt(standardInvitation.id, { ...afterLayout.theme, templateId: otherFree.catalogId, paletteId: otherFree.paletteId });
    const afterSwitch = await stored(standardInvitation.id);
    check(
      'B-036: published Standard → another Standard catalog theme is saved with its palette',
      toStandard.ok && afterSwitch.theme.templateId === otherFree.catalogId && afterSwitch.theme.paletteId === otherFree.paletteId,
      `${String(afterLayout.theme.templateId)} → ${String(afterSwitch.theme.templateId)}`,
    );
    check('B-036: the switch keeps every other section and the chosen layout', afterSwitch.rest === afterLayout.rest && afterSwitch.theme.familyId === 'gapura');
    check('B-036: the switch adds one version', afterSwitch.versions === afterLayout.versions + 1);
    check('B-036: the purchased theme (invitations.template_id) is unchanged', afterSwitch.templateId === freeTheme.id, String(afterSwitch.templateId));
    check('B-036: no order is created and the invitation stays published', afterSwitch.orders === afterLayout.orders && afterSwitch.status === 'PUBLISHED', `${afterSwitch.orders} orders, ${afterSwitch.status}`);
    check('B-036: publishing and checkout still see it paid (no second checkout)', await hasPaidOrder(standardInvitation.id, afterSwitch.templateId));

    const toPremium = await attempt(standardInvitation.id, { ...afterSwitch.theme, templateId: premiumTheme.catalogId, paletteId: premiumTheme.paletteId });
    const afterPremiumRefusal = await stored(standardInvitation.id);
    check('B-036: published Standard → a Premium catalog theme is refused', !toPremium.ok && toPremium.reasons.includes('premium-template'), toPremium.reasons.join(','));
    check('B-036: the refused switch writes nothing', afterPremiumRefusal.versions === afterSwitch.versions && afterPremiumRefusal.theme.templateId === otherFree.catalogId);

    const rowId = catalog.some((t) => t.catalogId === freeTheme.id) ? null : freeTheme.id;
    if (rowId !== null) {
      const byRowId = await attempt(standardInvitation.id, { ...afterSwitch.theme, templateId: rowId });
      check('B-036: a templates row id is no catalog id and is refused', !byRowId.ok && byRowId.reasons.includes('unknown-template'), String(rowId));
    }

    const otherStandard = otherFree.paletteId === 'sage' ? 'sand' : 'sage';
    const standardPalette = await attempt(standardInvitation.id, { ...afterSwitch.theme, paletteId: otherStandard });
    check('another Standard palette is accepted', standardPalette.ok, otherStandard);

    const upgrade = await settle(standardInvitation.id, premiumTheme.id, true);
    check('a Premium order for the same invitation settles', upgrade.applied);
    const afterUpgrade = await stored(standardInvitation.id);
    const premiumAfterOrder = await attempt(standardInvitation.id, { ...afterUpgrade.theme, paletteId: 'midnight' });
    check('with a settled Premium order the Premium palette is accepted', premiumAfterOrder.ok);
    const premiumThemeAfterOrder = await attempt(standardInvitation.id, { ...(await stored(standardInvitation.id)).theme, templateId: premiumTheme.catalogId });
    check('B-036: with a settled Premium order a Premium catalog theme is accepted', premiumThemeAfterOrder.ok, premiumThemeAfterOrder.reasons.join(','));

    const draft = await createInvitation({ userId: customer.id, eventType: 'wedding', templateId: freeTheme.id, title: 'theme check draft' });
    createdInvitations.push(draft.id);
    const draftTheme = (await stored(draft.id)).theme;
    const unpaid = await attempt(draft.id, { ...draftTheme, paletteId: 'gold-noir' });
    check('an unpaid Standard draft cannot take a Premium palette', !unpaid.ok && unpaid.reasons.includes('premium-palette'));
    const unpaidPremiumTheme = await attempt(draft.id, { ...draftTheme, templateId: premiumTheme.catalogId });
    check('B-036: an unpaid Standard draft cannot take a Premium catalog theme', !unpaidPremiumTheme.ok && unpaidPremiumTheme.reasons.includes('premium-template'));
    const unpaidStandardTheme = await attempt(draft.id, { ...draftTheme, templateId: otherFree.catalogId, paletteId: otherFree.paletteId });
    const afterDraftSwitch = await stored(draft.id);
    check('B-036: an unpaid Standard draft may switch to another Standard theme', unpaidStandardTheme.ok && afterDraftSwitch.theme.templateId === otherFree.catalogId && afterDraftSwitch.templateId === freeTheme.id);

    const premiumDraft = await createInvitation({ userId: customer.id, eventType: 'wedding', templateId: premiumTheme.id, title: 'theme check premium' });
    createdInvitations.push(premiumDraft.id);
    const premiumDraftTheme = (await stored(premiumDraft.id)).theme;
    const premiumOk = await attempt(premiumDraft.id, { ...premiumDraftTheme, paletteId: 'gold-noir' });
    check('a draft on a Premium theme may take a Premium palette (checkout charges Premium)', premiumOk.ok);
  } finally {
    if (createdOrders.length) {
      await db.delete(paymentEvents).where(inArray(paymentEvents.orderId, createdOrders));
      await db.delete(receipts).where(inArray(receipts.orderId, createdOrders));
      await db.delete(payments).where(inArray(payments.orderId, createdOrders));
      await db.delete(orders).where(inArray(orders.id, createdOrders));
    }
    if (createdInvitations.length) {
      await db.delete(invitationVersions).where(inArray(invitationVersions.invitationId, createdInvitations));
      await db.delete(invitations).where(and(inArray(invitations.id, createdInvitations), eq(invitations.userId, customer.id)));
    }
    await client.end();
  }

  console.log(failures ? `\n${failures} check(s) FAILED.` : '\nverify-theme-entitlement: all checks passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error('FAIL  unexpected error:', error);
  process.exitCode = 1;
});
