/**
 * G-053: what the checkout says when a coupon is refused. Every refusal wrote nothing, so each notice says so. An unknown,
 * inactive or malformed code gets the same answer: the page never reveals that a code exists before it is activated.
 */
const NOT_VALID = { en: 'That coupon code is not valid.', id: 'Kode kupon itu tidak berlaku.' };

const NOTICES: Record<string, { en: string; id: string }> = {
  unavailable: { en: 'Coupons are not available right now. Continue without a code.', id: 'Kupon sedang tidak tersedia. Lanjutkan tanpa kode.' },
  invalid: NOT_VALID,
  unknown: NOT_VALID,
  inactive: NOT_VALID,
  malformed: NOT_VALID,
  too_many: { en: 'Use at most three codes.', id: 'Pakai paling banyak tiga kode.' },
  not_started: { en: 'That coupon is not valid yet.', id: 'Kupon itu belum berlaku.' },
  expired: { en: 'That coupon has ended.', id: 'Kupon itu sudah berakhir.' },
  wrong_tier: { en: 'That coupon does not apply to this theme.', id: 'Kupon itu tidak berlaku untuk tema ini.' },
  wrong_currency: { en: 'That coupon does not apply to this currency.', id: 'Kupon itu tidak berlaku untuk mata uang ini.' },
  not_stackable: { en: 'Those coupons cannot be combined. Use one code.', id: 'Kupon-kupon itu tidak bisa digabung. Pakai satu kode.' },
  already_used: { en: 'You have already used that coupon.', id: 'Kamu sudah memakai kupon itu.' },
  exhausted: { en: 'That coupon has run out.', id: 'Kuota kupon itu sudah habis.' },
  below_minimum: { en: 'That discount is larger than this payment allows.', id: 'Diskon itu melebihi batas pembayaran ini.' },
};

export function couponNotice(reason: string | undefined, en: boolean): string {
  const notice = (reason && NOTICES[reason]) || NOT_VALID;
  return `${en ? notice.en : notice.id} ${en ? 'Nothing was charged.' : 'Belum ada tagihan.'}`;
}
