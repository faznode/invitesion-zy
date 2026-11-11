'use client';
import { useState } from 'react';
import { AlertCircle, Check, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { storedOnlyNotice } from '@/lib/invitation/content-contract';
import type { DetailConfig } from '@/lib/invitation/detail-config';
import { storedRegistrationForm, validateQuestions } from '@/lib/invitation/question-authoring';
import type { CustomQuestion } from '@/lib/invitation/rsvp-questions';
import { QuestionEditor } from './question-editor';

type Props={invitationId:number;module:string;initial:DetailConfig};
const input='mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';
export function ModuleConfigPanel({invitationId,module,initial}:Props){const [config,setConfig]=useState<any>(initial);const [saving,setSaving]=useState(false);const [notice,setNotice]=useState<{ok:boolean;text:string}|null>(null);const [showIssues,setShowIssues]=useState(false);
 const set=(key:string,value:any)=>setConfig((c:any)=>({...c,[key]:value}));
 async function save(key:string){
  let value=config[key];
  // E-031: the question list is checked with the detail API's own schema before it leaves the browser, and each field
  // that blocks saving says why, instead of one generic refusal from the server.
  if(key==='registrationForm'){
   const questions:CustomQuestion[]=value?.customQuestions??[];
   const issues=validateQuestions(questions);
   const stored=storedRegistrationForm(value??{},questions);
   if(issues.length||!stored.valid){setShowIssues(true);setNotice({ok:false,text:issues.length?`Belum tersimpan: ${issues.length} isian pertanyaan perlu diperbaiki.`:'Belum tersimpan: periksa isian formulir.'});return;}
   value=stored.value;
  }
  setSaving(true);setNotice(null);
  const r=await fetch(`/api/invitations/${invitationId}/detail`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({[key]:value})});
  setSaving(false);
  if(r.ok){set(key,value);setShowIssues(false);setNotice({ok:true,text:'Tersimpan.'});}
  else setNotice({ok:false,text:'Gagal menyimpan. Periksa isian.'});
 }
 const wrap=(key:string,title:string,body:React.ReactNode)=><section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><h3 className="font-bold text-slate-900">{title}</h3><div className="mt-4 space-y-4">{body}</div><div className="mt-5 flex items-center gap-3">{notice&&(notice.ok?<span role="status" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="h-4 w-4" aria-hidden/>{notice.text}</span>:<span role="alert" className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4" aria-hidden/>{notice.text}</span>)}<button onClick={()=>save(key)} disabled={saving} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-bold text-white disabled:opacity-60">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Simpan</button></div></section>;
 const field=(label:string,value:any,onChange:(v:string)=>void,type='text')=><label className="block"><span className="text-xs font-semibold text-slate-700">{label}</span><input className={input} type={type} value={value??''} onChange={e=>onChange(e.target.value)}/></label>;
 const toggle=(label:string,value:boolean,onChange:(v:boolean)=>void)=><label className="flex min-h-11 items-center justify-between rounded-lg border p-3 text-sm font-semibold"><span>{label}</span><input type="checkbox" checked={!!value} onChange={e=>onChange(e.target.checked)} className="h-4 w-4 accent-brand-600"/></label>;
 if(module==='registration-rsvp'||module==='custom-questions'){
  const x=config.registrationForm??{enabled:false,allowPlusOne:false,customQuestions:[]};
  // D-034: the form's own deadline, capacity, plus-one and message are saved but not shown or enforced on the guest page.
  const storedOnly=storedOnlyNotice('registrationForm','id')?.fields??[];
  return wrap('registrationForm','Form registrasi & pertanyaan custom',<>
   {toggle('Ajukan pertanyaan di form RSVP tamu',x.enabled,v=>set('registrationForm',{...x,enabled:v}))}
   <QuestionEditor questions={x.customQuestions??[]} showIssues={showIssues} onChange={(next)=>set('registrationForm',{...x,customQuestions:next})}/>
   <div className="space-y-3 rounded-lg border border-dashed border-slate-300 p-3">
    <p className="text-xs leading-5 text-slate-600">Disimpan untuk nanti, belum tampil atau berlaku di undangan: {storedOnly.join(', ')}. Batas waktu yang berlaku untuk tamu adalah batas RSVP.</p>
    <div className="grid gap-3 sm:grid-cols-2">{field('Kapasitas',x.capacity??'',v=>set('registrationForm',{...x,capacity:v?Number(v):undefined}),'number')}{field('Batas registrasi',x.deadline?new Date(x.deadline).toISOString().slice(0,16):'',v=>set('registrationForm',{...x,deadline:v?new Date(v).toISOString():undefined}),'datetime-local')}</div>
    {toggle('Izinkan pendamping',x.allowPlusOne??false,v=>set('registrationForm',{...x,allowPlusOne:v}))}
    {field('Pesan konfirmasi',x.confirmationMessage??'',v=>set('registrationForm',{...x,confirmationMessage:v}))}
   </div>
  </>)}
 if(module==='meals-dietary'){const x=config.mealPreferences??{enabled:false,options:[]};return wrap('mealPreferences','Menu & kebutuhan diet',<>{toggle('Kumpulkan pilihan menu',x.enabled,v=>set('mealPreferences',{...x,enabled:v}))}{field('Pilihan menu (pisahkan koma)',(x.options??[]).join(', '),v=>set('mealPreferences',{...x,options:v.split(',').map((s:string)=>s.trim()).filter(Boolean)}))}{toggle('Tanyakan alergi/kebutuhan khusus',x.collectAllergies??false,v=>set('mealPreferences',{...x,collectAllergies:v}))}</>)}
 if(module==='communications'){const x=config.communications??{};return wrap('communications','Template komunikasi',<><p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Konfigurasi tersimpan; pengiriman otomatis butuh provider email/WhatsApp aktif.</p>{field('Nama pengirim',x.senderLabel??'',v=>set('communications',{...x,senderLabel:v}))}{field('Email balasan',x.replyTo??'',v=>set('communications',{...x,replyTo:v}),'email')}{toggle('Aktifkan jadwal reminder',x.reminderEnabled??false,v=>set('communications',{...x,reminderEnabled:v}))}{field('Pesan reminder',x.reminderMessage??'',v=>set('communications',{...x,reminderMessage:v}))}</>)}
 if(module==='check-in'){const x=config.checkInSettings??{enabled:false,allowManual:true,requireQr:false};return wrap('checkInSettings','Pengaturan check-in',<>{toggle('Aktifkan check-in',x.enabled,v=>set('checkInSettings',{...x,enabled:v}))}{toggle('Izinkan check-in manual',x.allowManual??true,v=>set('checkInSettings',{...x,allowManual:v}))}{toggle('Wajib QR',x.requireQr??false,v=>set('checkInSettings',{...x,requireQr:v}))}<a href={`/dashboard/invitations/${invitationId}/guests`} className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-bold text-brand-700">Buka meja check-in</a></>)}
 if(module==='seating'){const x=config.seatingPlan??{tables:[]};const tables=x.tables??[];return wrap('seatingPlan','Meja & kapasitas',<><div className="space-y-2">{tables.map((t:any,i:number)=><div key={t.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_120px_40px]">{field('Nama meja',t.name,v=>set('seatingPlan',{tables:tables.map((z:any,j:number)=>j===i?{...z,name:v}:z)}))}{field('Kapasitas',t.capacity,v=>set('seatingPlan',{tables:tables.map((z:any,j:number)=>j===i?{...z,capacity:Number(v)}:z)}),'number')}<button aria-label="Hapus meja" onClick={()=>set('seatingPlan',{tables:tables.filter((_:any,j:number)=>j!==i)})}><Trash2 className="h-4 w-4 text-rose-600"/></button></div>)}</div><button onClick={()=>set('seatingPlan',{tables:[...tables,{id:`table-${Date.now()}`,name:`Meja ${tables.length+1}`,capacity:8,guestIds:[]}]})} className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-xs font-bold"><Plus className="h-4 w-4"/>Tambah meja</button></>)}
 if(module==='secondary-events'){const xs=config.secondaryEvents??[];return wrap('secondaryEvents','Rangkaian acara',<><div className="space-y-2">{xs.map((x:any,i:number)=><div key={x.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">{field('Nama sesi',x.title,v=>set('secondaryEvents',xs.map((z:any,j:number)=>j===i?{...z,title:v}:z)))}{field('Venue',x.venueName??'',v=>set('secondaryEvents',xs.map((z:any,j:number)=>j===i?{...z,venueName:v}:z)))}</div>)}</div><button onClick={()=>set('secondaryEvents',[...xs,{id:`event-${Date.now()}`,title:'Sesi baru',eligibleGuestIds:[]}])} className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-xs font-bold"><Plus className="h-4 w-4"/>Tambah sesi</button></>)}
 if(module==='tickets-donations'){const x=config.ticketing??{enabled:false,mode:'free',currency:'IDR',tiers:[]};return wrap('ticketing','Tiket & donasi',<><p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Ini baru konfigurasi produk. Pembayaran peserta dan payout belum terintegrasi.</p>{toggle('Aktifkan konfigurasi tiket',x.enabled,v=>set('ticketing',{...x,enabled:v}))}<label className="block text-xs font-semibold">Mode<select className={input} value={x.mode} onChange={e=>set('ticketing',{...x,mode:e.target.value})}><option value="free">Gratis</option><option value="paid">Berbayar</option><option value="donation">Donasi</option></select></label></>)}
 if(module==='analytics-export')return <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><h3 className="font-bold text-slate-900">Analytics & export</h3><p className="mt-2 text-sm text-slate-600">Download snapshot tamu, RSVP, pengiriman, dan check-in untuk operasional event.</p><a href={`/dashboard/invitations/${invitationId}/analytics`} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-bold text-white">Download CSV tamu</a></section>;
 if(module==='settings'){const x=config.eventOperations??{enabled:false};return wrap('eventOperations','Operasional event',<>{toggle('Aktifkan workspace operasional',x.enabled,v=>set('eventOperations',{...x,enabled:v}))}{field('Timezone',x.timezone??'Asia/Jakarta',v=>set('eventOperations',{...x,timezone:v}))}{field('Email kontak',x.contactEmail??'',v=>set('eventOperations',{...x,contactEmail:v}),'email')}</>)}
 return null;
}
