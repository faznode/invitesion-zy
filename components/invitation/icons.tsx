/**
 * E-046 (s22): the guest page's decorative icons, each one masked element painted in `currentColor`. The SVG of
 * every icon lives once in the shared stylesheet (`app/globals.css`, `.inv-icon-*`) instead of in every page's markup
 * and RSC payload, where a dozen inline icons were ≈ 30 % of each family page's HTML and elements. The class mirrors
 * how Tailwind's preflight lays out an inline `<svg>` (a block box), so the layouts' size, margin and colour utilities
 * keep their meaning. Always decorative: never give one of these a text alternative; name the control instead.
 */
/** B-009 adds `volume-2` and `volume-x` for the music control (on and off); B-025 the lightbox's and video poster's four. */
export type InvitationIconName =
  | 'calendar-days'
  | 'calendar-plus'
  | 'clock'
  | 'gift'
  | 'map-pin'
  | 'quote'
  | 'radio'
  | 'volume-2'
  | 'volume-x'
  | 'x'
  | 'chevron-left'
  | 'chevron-right'
  | 'play';

export function InvitationIcon({ name, className }: { name: InvitationIconName; className?: string }) {
  return <span aria-hidden="true" className={className ? `inv-icon inv-icon-${name} ${className}` : `inv-icon inv-icon-${name}`} />;
}
