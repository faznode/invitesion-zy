import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db, client } from '@/lib/db/drizzle';
import { users, invitations, mediaAssets, invitationVersions } from '@/lib/db/schema';
import {
  addMedia,
  listMedia,
  updateMedia,
  deleteMedia,
  getDetailConfig,
  updateDetailConfig,
  DuplicateSequenceError,
  OwnershipError,
} from '@/lib/invitation/service';

const results: string[] = [];
function check(name: string, ok: boolean) {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const stamp = Date.now();
  // Two separate customers to prove ownership isolation.
  const [owner] = await db
    .insert(users)
    .values({ email: `owner-${stamp}@e2e.test`, role: 'CUSTOMER' })
    .returning();
  const [intruder] = await db
    .insert(users)
    .values({ email: `intruder-${stamp}@e2e.test`, role: 'CUSTOMER' })
    .returning();

  const [inv] = await db
    .insert(invitations)
    .values({ userId: owner.id, slug: `e2e-${stamp}`, eventType: 'wedding', config: {} })
    .returning();

  // ── Media ordering: insert in REVERSE sequence with random-looking names ──
  // If ordering ever leaked from filename/url, this would come back wrong.
  await addMedia(inv.id, owner.id, {
    type: 'photo',
    url: 'https://cdn.example.com/img_a285f9b1.jpeg',
    uploadSequence: 3,
    source: 'chat',
  });
  await addMedia(inv.id, owner.id, {
    type: 'photo',
    url: 'https://cdn.example.com/img_00019.jpeg',
    uploadSequence: 1,
    source: 'chat',
  });
  await addMedia(inv.id, owner.id, {
    type: 'photo',
    url: 'https://cdn.example.com/zzz_last_alpha.jpeg',
    uploadSequence: 2,
    source: 'chat',
  });

  const ordered = await listMedia(inv.id, owner.id);
  check(
    'media ordered by explicit upload sequence, not filename',
    ordered.map((m) => m.uploadSequence).join(',') === '1,2,3',
  );
  check(
    'first asset is the one sent first regardless of random filename',
    ordered[0].url === 'https://cdn.example.com/img_00019.jpeg',
  );

  // ── Duplicate sequence rejected ──
  let dup = false;
  try {
    await addMedia(inv.id, owner.id, {
      type: 'photo',
      url: 'https://cdn.example.com/dupe.jpeg',
      uploadSequence: 1,
      source: 'chat',
    });
  } catch (e) {
    dup = e instanceof DuplicateSequenceError;
  }
  check('duplicate uploadSequence rejected', dup);

  // ── Reorder via sortOrder keeps uploadSequence provenance ──
  const moved = await updateMedia(inv.id, owner.id, ordered[0].id, { sortOrder: 99 });
  const afterReorder = await listMedia(inv.id, owner.id);
  check('reorder moves asset to the end', afterReorder[afterReorder.length - 1].id === moved.id);
  check('uploadSequence provenance preserved after reorder', moved.uploadSequence === 1);

  // ── Ownership isolation ──
  let blockedList = false;
  try {
    await listMedia(inv.id, intruder.id);
  } catch (e) {
    blockedList = e instanceof OwnershipError;
  }
  check('intruder cannot list media of another customer', blockedList);

  let blockedDelete = false;
  try {
    await deleteMedia(inv.id, intruder.id, ordered[0].id);
  } catch (e) {
    blockedDelete = e instanceof OwnershipError;
  }
  check('intruder cannot delete another customer asset', blockedDelete);

  // ── Detail config merge + version snapshot ──
  await updateDetailConfig(inv.id, owner.id, {
    couple: { bride: { fullName: 'Sinta' } },
    events: [{ title: 'Akad' }],
  });
  await updateDetailConfig(inv.id, owner.id, {
    couple: { groom: { fullName: 'Bagus' } },
  });
  const cfg = await getDetailConfig(inv.id, owner.id);
  check('detail deep-merge keeps prior bride and adds groom', cfg.couple?.bride?.fullName === 'Sinta' && cfg.couple?.groom?.fullName === 'Bagus');
  check('detail array replaced wholesale (events retained)', cfg.events?.[0]?.title === 'Akad');

  const versions = await db
    .select()
    .from(invitationVersions)
    .where(eq(invitationVersions.invitationId, inv.id));
  check('a version snapshot exists per detail update', versions.length === 2);
  check('exactly one live version', versions.filter((v) => v.isLive).length === 1);

  let blockedDetail = false;
  try {
    await updateDetailConfig(inv.id, intruder.id, { quote: { enabled: false, text: 'hack' } });
  } catch (e) {
    blockedDetail = e instanceof OwnershipError;
  }
  check('intruder cannot mutate detail config', blockedDetail);

  // ── Cleanup ──
  await db.delete(invitationVersions).where(eq(invitationVersions.invitationId, inv.id));
  await db.delete(mediaAssets).where(eq(mediaAssets.invitationId, inv.id));
  await db.delete(invitations).where(eq(invitations.id, inv.id));
  await db.delete(users).where(and(eq(users.id, owner.id)));
  await db.delete(users).where(and(eq(users.id, intruder.id)));

  console.log(results.join('\n'));
  await client.end();
  process.exit(process.exitCode ?? 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
