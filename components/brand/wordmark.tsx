import Link from 'next/link';

/**
 * The Invitesion wordmark — one definition, used everywhere.
 *
 * The marketing header rendered `invitesion` plus a pink full stop, styled by
 * `.logo` in `home.module.css`. The auth pages had invented their own square "V"
 * badge instead, so the first thing a visitor saw when signing in was a logo the
 * product does not use.
 *
 * Reproduced with Tailwind rather than reused from the CSS module on purpose:
 * `.logo span` colours the full stop with `var(--pink)`, which is declared on
 * `.site` and therefore resolves to nothing outside the marketing shell. A
 * wordmark that silently loses its accent colour depending on which page it is
 * on is exactly the drift this component exists to prevent.
 *
 * Typography matches `.logo` exactly: 29px, weight 800, -0.08em tracking.
 */
export function Wordmark({
  href = '/',
  className = '',
  size = 'md',
  onClick,
}: {
  /** Omit to render as plain text rather than a link. */
  href?: string | null;
  className?: string;
  size?: 'sm' | 'md';
  onClick?: () => void;
}) {
  const sizing = size === 'sm' ? 'text-[22px]' : 'text-[29px]';
  const mark = (
    <span className={`font-extrabold leading-none tracking-[-0.08em] ${sizing} ${className}`}>
      invitesion<span className="text-brand-600">.</span>
    </span>
  );

  if (!href) return mark;

  return (
    <Link href={href} onClick={onClick} aria-label="Invitesion" className="inline-flex items-center">
      {mark}
    </Link>
  );
}
