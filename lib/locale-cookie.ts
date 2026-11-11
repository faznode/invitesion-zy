/**
 * Whether middleware mirrors the resolved locale into the `locale` cookie for this path.
 *
 * Guest invitation pages (`/i/*`) are excluded (B-014 step 1): they read the locale from the `x-app-locale` request
 * header that middleware still sets, so the cookie adds nothing there. Meanwhile a `Set-Cookie` on every guest open
 * makes the response unshareable by any cache, on the route that takes a WhatsApp blast all at once.
 */
export function mirrorsLocaleCookie(pathname: string): boolean {
  return !(pathname === '/i' || pathname.startsWith('/i/'));
}
