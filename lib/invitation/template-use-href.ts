/**
 * B-037: where a catalog theme's "Pakai tema" leads. With `FLAG_CREATION_WIZARD` on, the wizard (`/buat/<tema>`: names,
 * date and theme, previewed before anything is stored); off, the path before B-037 (sign in, then an empty draft).
 * The flag is read on the server and passed down, so client components need no environment.
 */
export function templateUseHref(slug: string, wizard: boolean): string {
  const segment = encodeURIComponent(slug);
  return wizard ? `/buat/${segment}` : `/dashboard/templates/use?slug=${segment}`;
}
