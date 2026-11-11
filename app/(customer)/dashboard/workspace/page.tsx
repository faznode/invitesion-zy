import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { invitationStatusLabel, type Locale } from '@/lib/i18n';
import { memberHome, WORKSPACE_ROLE_AS_MEMBER, WORKSPACE_ROLES, workspaceRoleCopy, type TeamRowState } from '@/lib/invitation/members';
import { getLocale } from '@/lib/locale-server';
import {
  assignableInvitations,
  clientInvitations,
  ownedWorkspace,
  workspaceMemberships,
  workspaceStaff,
  type ClientInvitation,
} from '@/lib/workspace/workspace-db';
import {
  assignClientAction,
  createWorkspaceAction,
  leaveWorkspaceAction,
  revokeStaffAction,
  unassignClientAction,
} from './actions';
import { StaffLinkForm } from './staff-link-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `${COPY[locale].eyebrow} · Invitesion`, robots: { index: false, follow: false } };
}

type NoticeKey = 'created' | 'revoked' | 'assigned' | 'unassigned' | 'left' | 'joined' | 'name' | 'exists' | 'client' | 'notfound';
const SUCCESS_NOTICES = ['created', 'revoked', 'assigned', 'unassigned', 'left', 'joined'] as const satisfies readonly NoticeKey[];
const ERROR_NOTICES = ['name', 'exists', 'client', 'notfound'] as const satisfies readonly NoticeKey[];

/** Every string the page shows, per locale. The Indonesian copy is the page's original copy. */
const COPY = {
  id: {
    eyebrow: 'Ruang kerja',
    defaultTitle: 'Ruang kerja reseller',
    intro:
      'Kelola undangan klien bersama staf. Anda tetap pemilik setiap undangan: isi, tema, pembayaran dan publikasi hanya bisa diubah dari akun Anda.',
    notices: {
      created: 'Ruang kerja dibuat. Tambahkan undangan klien dan staf di bawah.',
      revoked: 'Akses dicabut. Staf tersebut ditolak sejak permintaan berikutnya.',
      assigned: 'Undangan klien disimpan.',
      unassigned: 'Undangan dikembalikan menjadi undangan pribadi. Staf tidak lagi bisa membukanya.',
      left: 'Anda sudah keluar dari ruang kerja itu.',
      joined: 'Anda sudah bergabung. Undangan klien ruang kerja itu ada di bawah.',
      name: 'Nama ruang kerja harus 2 sampai 80 karakter.',
      exists: 'Akun ini sudah memiliki ruang kerja.',
      client: 'Tulis nama klien, 2 sampai 80 karakter.',
      notfound: 'Perubahan tidak dapat disimpan. Muat ulang halaman lalu coba lagi.',
    } satisfies Record<NoticeKey, string>,
    disabled: 'Ruang kerja ini sedang dinonaktifkan. Staf tidak bisa membuka undangan klien sampai diaktifkan kembali.',
    createHeading: 'Buat ruang kerja',
    createHelp: 'Satu akun memiliki satu ruang kerja. Nama ini terlihat oleh staf yang Anda undang.',
    nameLabel: 'Nama ruang kerja',
    namePlaceholder: 'Studio Undangan Melati',
    createButton: 'Buat ruang kerja',
    staffedHeading: 'Ruang kerja tempat Anda bertugas',
    rolePrefix: 'Peran',
    noClients: 'Belum ada undangan klien di ruang kerja ini.',
    openDesk: 'Buka meja check-in',
    manageGuests: 'Kelola tamu',
    leave: 'Keluar dari ruang kerja ini',
    unnamedClient: 'Tanpa nama klien',
    clientsHeading: 'Undangan klien',
    clientsEmpty: 'Belum ada. Pilih salah satu undangan Anda di bawah untuk dikelola bersama staf.',
    open: 'Buka',
    openInvitation: 'undangan',
    makePersonal: 'Jadikan pribadi',
    invitationLabel: 'Undangan',
    clientLabel: 'Nama klien',
    assignButton: 'Jadikan undangan klien',
    staffHeading: 'Staf',
    staffEmpty: 'Belum ada staf atau tautan aktif.',
    revoke: 'Cabut',
    states: { active: 'Aktif', pending: 'Menunggu diterima', expired: 'Tautan kedaluwarsa' } satisfies Record<TeamRowState, string>,
  },
  en: {
    eyebrow: 'Workspace',
    defaultTitle: 'Reseller workspace',
    intro:
      'Manage client invitations with your staff. You remain the owner of every invitation: content, theme, payment and publishing can only be changed from your account.',
    notices: {
      created: 'Workspace created. Add client invitations and staff below.',
      revoked: 'Access revoked. That staff member is refused from their next request.',
      assigned: 'Client invitation saved.',
      unassigned: 'The invitation is personal again. Staff can no longer open it.',
      left: 'You have left that workspace.',
      joined: "You have joined. That workspace's client invitations are below.",
      name: 'A workspace name must be 2 to 80 characters.',
      exists: 'This account already has a workspace.',
      client: "Write the client's name, 2 to 80 characters.",
      notfound: 'The change could not be saved. Reload the page and try again.',
    } satisfies Record<NoticeKey, string>,
    disabled: 'This workspace is disabled. Staff cannot open client invitations until it is enabled again.',
    createHeading: 'Create a workspace',
    createHelp: 'One account owns one workspace. Staff you invite see this name.',
    nameLabel: 'Workspace name',
    namePlaceholder: 'Melati Invitation Studio',
    createButton: 'Create workspace',
    staffedHeading: 'Workspaces you staff',
    rolePrefix: 'Role',
    noClients: 'This workspace has no client invitations yet.',
    openDesk: 'Open the check-in desk',
    manageGuests: 'Manage guests',
    leave: 'Leave this workspace',
    unnamedClient: 'No client name',
    clientsHeading: 'Client invitations',
    clientsEmpty: 'None yet. Choose one of your invitations below to manage it with your staff.',
    open: 'Open',
    openInvitation: 'invitation',
    makePersonal: 'Make personal',
    invitationLabel: 'Invitation',
    clientLabel: 'Client name',
    assignButton: 'Make it a client invitation',
    staffHeading: 'Staff',
    staffEmpty: 'No staff or active links yet.',
    revoke: 'Revoke',
    states: { active: 'Active', pending: 'Waiting to be accepted', expired: 'Link expired' } satisfies Record<TeamRowState, string>,
  },
} as const;

type PageCopy = (typeof COPY)[Locale];

function noticeFrom(params: Record<string, string | undefined>, copy: PageCopy): { text: string; error: boolean } | null {
  const error = ERROR_NOTICES.find((key) => params.error === key);
  if (error) return { text: copy.notices[error], error: true };
  const success = SUCCESS_NOTICES.find((key) => params[key]);
  return success ? { text: copy.notices[success], error: false } : null;
}

/**
 * G-052 (D-067): the reseller workspace. Its owner names it, makes their own invitations client invitations and
 * manages staff links; staff see the client invitations of the workspaces they staff, each opening on the page their
 * role allows. Administrator accounts and the flag off: 404. Indonesian or English with the dashboard's locale.
 */
export default async function WorkspacePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isFlagOn('WORKSPACES')) notFound();
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') notFound();

  const [owned, memberships, params, locale] = await Promise.all([ownedWorkspace(user.id), workspaceMemberships(user.id), searchParams, getLocale()]);
  const copy = COPY[locale];
  const roles = workspaceRoleCopy(locale);
  const notice = noticeFrom(params, copy);
  const staffed = await Promise.all(memberships.map(async (membership) => ({ membership, invitations: await clientInvitations(membership.workspaceId) })));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        {/* brand-700, not primary: the dashboard's slate background takes primary below 4.5:1 (axe, s42). */}
        <p className="text-sm font-semibold text-brand-700">{copy.eyebrow}</p>
        <h1 className="text-balance font-serif text-3xl leading-tight text-foreground">{owned ? owned.name : copy.defaultTitle}</h1>
        <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">{copy.intro}</p>
      </header>

      {notice ? (
        <p role={notice.error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${notice.error ? 'border-destructive text-destructive' : 'border-border bg-muted text-foreground'}`}>
          {notice.text}
        </p>
      ) : null}

      {owned && owned.disabledAt ? <p className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground">{copy.disabled}</p> : null}

      {owned && !owned.disabledAt ? <OwnerSections workspaceId={owned.id} ownerId={user.id} locale={locale} /> : null}

      {!owned ? (
        <section aria-labelledby="create-heading" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <h2 id="create-heading" className="font-serif text-xl text-foreground">
            {copy.createHeading}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{copy.createHelp}</p>
          <form action={createWorkspaceAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="workspace-name" className="text-sm font-medium text-foreground">
                {copy.nameLabel}
              </label>
              <input
                id="workspace-name"
                name="name"
                required
                minLength={2}
                maxLength={80}
                placeholder={copy.namePlaceholder}
                className="rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground"
              />
            </div>
            <button type="submit" className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90">
              {copy.createButton}
            </button>
          </form>
        </section>
      ) : null}

      {staffed.length > 0 ? (
        <section aria-labelledby="staffed-heading" className="flex flex-col gap-4">
          <h2 id="staffed-heading" className="font-serif text-xl text-foreground">
            {copy.staffedHeading}
          </h2>
          {staffed.map(({ membership, invitations }) => (
            <article key={membership.workspaceId} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h3 className="text-lg font-semibold text-foreground">{membership.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {copy.rolePrefix}: {roles[membership.role].name}
                </p>
              </div>
              {invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{copy.noClients}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {invitations.map((invitation) => (
                    <li key={invitation.invitationId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <ClientName invitation={invitation} locale={locale} />
                      {/* A full page load: the check-in desk needs its own camera policy (D-056). */}
                      <a
                        href={memberHome(invitation.invitationId, WORKSPACE_ROLE_AS_MEMBER[membership.role])}
                        className="w-fit rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                      >
                        {membership.role === 'desk' ? copy.openDesk : copy.manageGuests}
                        <span className="sr-only">: {invitation.clientLabel ?? invitation.slug}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <form action={leaveWorkspaceAction}>
                <input type="hidden" name="workspaceId" value={membership.workspaceId} />
                <button type="submit" className="text-sm font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  {copy.leave}
                </button>
              </form>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ClientName({ invitation, locale }: { invitation: ClientInvitation; locale: Locale }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="break-words font-semibold text-foreground">{invitation.clientLabel ?? COPY[locale].unnamedClient}</span>
      <span className="break-words text-sm text-muted-foreground">
        /{invitation.slug} · {invitationStatusLabel(invitation.status, locale)}
      </span>
    </div>
  );
}

async function OwnerSections({ workspaceId, ownerId, locale }: { workspaceId: number; ownerId: number; locale: Locale }) {
  const [clients, assignable, staff] = await Promise.all([clientInvitations(workspaceId), assignableInvitations(ownerId), workspaceStaff(workspaceId)]);
  const copy = COPY[locale];
  const roles = workspaceRoleCopy(locale);
  return (
    <>
      <section aria-labelledby="clients-heading" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <h2 id="clients-heading" className="font-serif text-xl text-foreground">
          {copy.clientsHeading}
        </h2>
        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.clientsEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {clients.map((invitation) => (
              <li key={invitation.invitationId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <ClientName invitation={invitation} locale={locale} />
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/dashboard/invitations/${invitation.invitationId}/manage`}
                    className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    {copy.open}
                    <span className="sr-only">
                      {' '}
                      {copy.openInvitation} {invitation.clientLabel ?? invitation.slug}
                    </span>
                  </a>
                  <form action={unassignClientAction}>
                    <input type="hidden" name="invitationId" value={invitation.invitationId} />
                    <button type="submit" className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
                      {copy.makePersonal}
                      <span className="sr-only">: {invitation.clientLabel ?? invitation.slug}</span>
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {assignable.length > 0 ? (
          <form action={assignClientAction} className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1">
              <label htmlFor="assign-invitation" className="text-sm font-medium text-foreground">
                {copy.invitationLabel}
              </label>
              <select id="assign-invitation" name="invitationId" className="rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground">
                {assignable.map((invitation) => (
                  <option key={invitation.invitationId} value={invitation.invitationId}>
                    /{invitation.slug}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="assign-client" className="text-sm font-medium text-foreground">
                {copy.clientLabel}
              </label>
              <input
                id="assign-client"
                name="clientLabel"
                required
                minLength={2}
                maxLength={80}
                placeholder="Budi & Sari"
                className="rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground"
              />
            </div>
            <button type="submit" className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90">
              {copy.assignButton}
            </button>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="staff-heading" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 id="staff-heading" className="font-serif text-xl text-foreground">
            {copy.staffHeading}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {roles.manager.name}: {roles.manager.summary} {roles.desk.name}: {roles.desk.summary}
          </p>
        </div>
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.staffEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {staff.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col">
                  <span className="break-words font-semibold text-foreground">{row.label}</span>
                  <span className="break-words text-sm text-muted-foreground">
                    {roles[row.role].name} · {copy.states[row.state]}
                    {row.state === 'active' && row.email ? ` · ${row.name ? `${row.name}, ` : ''}${row.email}` : ''}
                  </span>
                </div>
                <form action={revokeStaffAction}>
                  <input type="hidden" name="rowId" value={row.id} />
                  <button type="submit" className="rounded-full px-4 py-2 text-sm font-semibold text-destructive hover:bg-muted">
                    {copy.revoke}
                    <span className="sr-only">: {row.label}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <StaffLinkForm locale={locale} roleNames={Object.fromEntries(WORKSPACE_ROLES.map((role) => [role, roles[role].name])) as Record<(typeof WORKSPACE_ROLES)[number], string>} />
      </section>
    </>
  );
}
