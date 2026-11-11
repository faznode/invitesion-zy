import { invitationTemplates } from '../../../../lib/invitation/templates';
const en = invitationTemplates.filter((t: any) => t.preset?.settings?.language === 'en');
console.log(`catalog ${invitationTemplates.length}, English presets ${en.length}`);
for (const t of en as any[]) console.log(` ${t.id} ${t.slug} (${t.category}) family=${t.preset?.theme?.familyId ?? '-'} `);
