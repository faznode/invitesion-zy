import { formatEventDate, formatEventTime } from '../../../../lib/invitation/event-time';
import { previewImageModel, previewImageVersion } from '../../../../lib/invitation/preview-image';
const at = '2026-12-28T00:30:00+08:00';
console.log('date en', JSON.stringify(formatEventDate(at, undefined, 'en-GB')), 'id', JSON.stringify(formatEventDate(at)));
console.log('time en', JSON.stringify(formatEventTime(at, undefined, 'en-GB')), 'id', JSON.stringify(formatEventTime(at)));
const config: any = { couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } }, events: [{ id: 'ev-a1', title: 'Akad', startAt: at }], theme: { paletteId: 'sage' } };
for (const [label, c] of [['legacy unset', config], ['legacy en', { ...config, settings: { language: 'en' } }], ['gapura unset', { ...config, theme: { ...config.theme, familyId: 'gapura' } }], ['gapura en', { ...config, theme: { ...config.theme, familyId: 'gapura' }, settings: { language: 'en' } }]] as const) {
  const m = previewImageModel('wedding', c as any, true);
  console.log(label, JSON.stringify(m.label), JSON.stringify(m.date), previewImageVersion(m));
}
