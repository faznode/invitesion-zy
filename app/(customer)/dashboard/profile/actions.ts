'use server';

import { eq, and, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { saveAvatar } from '@/lib/storage';

const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

const schema = z.object({
  name: z.string().trim().min(2, 'nama minimal 2 karakter').max(100),
  email: z.string().trim().email('email tidak valid'),
  phone: optional(30),
  whatsapp: optional(30),
  instagram: optional(100),
  xHandle: optional(100),
});

const clean = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export async function updateCustomerProfile(formData: FormData): Promise<void> {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const parsed = schema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? undefined,
    whatsapp: formData.get('whatsapp') ?? undefined,
    instagram: formData.get('instagram') ?? undefined,
    xHandle: formData.get('xHandle') ?? undefined,
  });
  if (!parsed.success) redirect('/dashboard/profile?error=invalid');
  const data = parsed.data;

  // Guard uniqueness before writing so the error is explainable, not a raw 500.
  const [emailClash] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, data.email), ne(users.id, user.id)))
    .limit(1);
  if (emailClash) redirect('/dashboard/profile?error=email');

  const phone = clean(data.phone);
  if (phone) {
    const [phoneClash] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, phone), ne(users.id, user.id)))
      .limit(1);
    if (phoneClash) redirect('/dashboard/profile?error=phone');
  }

  let avatarUrl = user.avatarUrl;
  const file = formData.get('avatar');
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024 || !file.type.startsWith('image/')) {
      redirect('/dashboard/profile?error=avatar');
    }
    const saved = await saveAvatar(user.id, file);
    if (!saved) redirect('/dashboard/profile?error=avatar');
    avatarUrl = saved;
  }

  try {
    await db
      .update(users)
      .set({
        name: data.name,
        email: data.email,
        phone,
        whatsapp: clean(data.whatsapp),
        instagram: clean(data.instagram),
        xHandle: clean(data.xHandle),
        marketingConsent: formData.get('marketingConsent') === 'on',
        avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  } catch {
    redirect('/dashboard/profile?error=duplicate');
  }

  revalidatePath('/dashboard/profile');
  revalidatePath('/dashboard');
  redirect('/dashboard/profile?saved=1');
}
