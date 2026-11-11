'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertAuthorizedAdmin, getPrivateAdminPath } from '@/lib/auth/admin-access';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { saveAvatar } from '@/lib/storage';

const schema = z.object({ name:z.string().trim().min(2).max(100), email:z.string().trim().email(), phone:z.string().trim().max(30).optional(), whatsapp:z.string().trim().max(30).optional(), instagram:z.string().trim().max(100).optional(), xHandle:z.string().trim().max(100).optional() });
export async function updateProfile(formData: FormData): Promise<void> {
 const user=assertAuthorizedAdmin(await getUser());
 const adminPath=getPrivateAdminPath(); if(!adminPath) redirect('/admin');
 const data=schema.safeParse({name:formData.get('name'),email:formData.get('email'),phone:formData.get('phone')||undefined,whatsapp:formData.get('whatsapp')||undefined,instagram:formData.get('instagram')||undefined,xHandle:formData.get('xHandle')||undefined});
 if(!data.success) redirect(`${adminPath}/general?error=invalid`);
 let avatarUrl=user.avatarUrl; const file=formData.get('avatar');
 if(file instanceof File && file.size){ if(file.size>2*1024*1024 || !file.type.startsWith('image/')) redirect(`${adminPath}/general?error=avatar`); const saved=await saveAvatar(user.id,file); if(!saved) redirect(`${adminPath}/general?error=avatar`); avatarUrl=saved; }
 try { await db.update(users).set({...data.data,phone:data.data.phone||null,whatsapp:data.data.whatsapp||null,instagram:data.data.instagram||null,xHandle:data.data.xHandle||null,marketingConsent:formData.get('marketingConsent')==='on',avatarUrl,updatedAt:new Date()}).where(eq(users.id,user.id)); } catch { redirect(`${adminPath}/general?error=duplicate`); }
 revalidatePath(`${adminPath}/general`); revalidatePath(adminPath); redirect(`${adminPath}/general?saved=1`);
}
