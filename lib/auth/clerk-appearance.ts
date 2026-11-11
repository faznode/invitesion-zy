import { idID } from '@clerk/localizations';

/**
 * Clerk's hosted forms, dressed as part of this product.
 *
 * The reason for adopting Clerk was password reset, email verification, and
 * social sign-in — not its default look. Left unstyled it reads as a bolted-on
 * third-party widget, which is exactly the "too basic" complaint that started
 * this, only with someone else's branding.
 *
 * Values mirror `--color-brand-*` and the panel surfaces in `globals.css`.
 * Clerk's `variables` do not read CSS custom properties, so these are literals;
 * if the brand scale changes, change them here too. That duplication is the
 * price of a third-party renderer and is worth naming rather than hiding.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: '#e80053', // brand-600
    colorText: '#18121d',
    colorTextSecondary: '#695d72',
    colorBackground: '#ffffff',
    colorInputBackground: '#ffffff',
    colorInputText: '#18121d',
    colorDanger: '#dc2626',
    colorSuccess: '#059669',
    borderRadius: '0.6rem',
    fontFamily: 'Manrope, ui-sans-serif, system-ui, sans-serif',
    fontSize: '0.9375rem',
  },
  elements: {
    // The card sits inside our own page shell, so it brings no chrome of its own.
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none border-0',
    card: 'shadow-none border-0 bg-transparent p-0',
    header: 'text-left',
    headerTitle: 'text-2xl font-bold tracking-tight text-slate-900',
    headerSubtitle: 'text-sm text-slate-500',

    formButtonPrimary:
      'min-h-11 rounded-lg bg-brand-600 text-sm font-semibold text-white normal-case shadow-sm ' +
      'transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 ' +
      'focus-visible:outline-offset-2 focus-visible:outline-brand-600',

    formFieldLabel: 'text-sm font-semibold text-slate-700',
    formFieldInput:
      'min-h-11 rounded-lg border-slate-200 bg-white text-sm text-slate-900 ' +
      'focus:border-brand-400 focus:ring-2 focus:ring-brand-100',

    socialButtonsBlockButton:
      'min-h-11 rounded-lg border-slate-200 bg-white text-sm font-semibold text-slate-700 ' +
      'normal-case transition hover:bg-slate-50',
    socialButtonsBlockButtonText: 'font-semibold',

    dividerLine: 'bg-slate-200',
    dividerText: 'text-xs text-slate-400',

    footerActionText: 'text-sm text-slate-500',
    footerActionLink: 'text-sm font-semibold text-brand-700 hover:text-brand-800',

    identityPreviewEditButton: 'text-brand-700',
    formResendCodeLink: 'text-brand-700',
    otpCodeFieldInput: 'rounded-lg border-slate-200',

    /*
     * NOT attempted here: hiding the "Secured by Clerk" badge.
     *
     * A `footer: 'hidden'` rule was tried and does not work — Clerk's own styles
     * win, because removing the badge is a plan feature rather than a styling
     * option. CSS-hiding it would be working around their plan terms, so it
     * stays until the account is on a plan that allows removal.
     *
     * The separate "Development mode" strip is not styling either: it marks a
     * Clerk *development* instance and disappears on a production instance.
     */
  },
  layout: {
    socialButtonsPlacement: 'top',
    socialButtonsVariant: 'blockButton',
    showOptionalFields: true,
  },
};

/**
 * Indonesian by default, English when the visitor's locale resolved to English.
 *
 * The product's default language is Indonesian, and an auth form that suddenly
 * switches to English is the most visible seam a third-party component can
 * introduce. `undefined` selects Clerk's built-in English.
 */
export function clerkLocalization(locale: string) {
  return locale === 'en' ? undefined : idID;
}
