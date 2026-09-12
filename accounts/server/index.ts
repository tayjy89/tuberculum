import postgres from 'npm:postgres@3.4.7';
import content from './content.json' with {type:'json'};
import {score,passes,sanitise,validateEvaluation,eligible,fresh} from './rules.mjs';
const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:3,idle_timeout:20,connect_timeout:15});
const base=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const site='https://tuberculum.vercel.app';
const origins=new Set([site,'http://localhost:4173']);
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
async function authApi(path:string,body:any,method='POST',token=key){const r=await fetch(base+'/auth/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();if(!r.ok)throw Error(d.msg||d.message||'Account request failed.');return d;}
function view(s:any){return {...s,attempts:s.attempts.map((a:any)=>a.finished?a:{id:a.id,answers:a.answers.map((r:any)=>({values:r.values})),finished:false}),pre:s.pre?{...s.pre,score:undefined}:null};}
Deno.serve(async(req)=>{
 const origin=req.headers.get('Origin');const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin&&origins.has(origin)?origin:site,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 const out=(d:any,status=200)=>new Response(JSON.stringify(d),{status,headers});
 if(origin&&!origins.has(origin))return out({error:'Origin not allowed.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return out({error:'Use POST.'},405);
 try{
 const raw=await req.text();if(raw.length>50000)return out({error:'Request too large.'},413);const b=JSON.parse(raw);const action=b.action;
 if(action==='accept'){
  if(typeof b.token!=='string'||b.token.length!==64||typeof b.password!=='string'||b.password.length<12||b.password.length>128)throw Error('Use the complete invitation and a password of 12–128 characters.');
  const tokenHash=await hash(b.token);
  return out(await sql.begin(async tx=>{
   const [invite]=await tx`select * from course_private.invitations where token_hash=${tokenHash} and status='pending' and expires_at>now() for update`;
   if(!invite)throw Error('This link has expired or has already been used. Ask the administrator for a new link.');
   const [existing]=await tx`select id from auth.users where lower(email)=${invite.email}`;
   let userId;
   if(invite.purpose==='recovery'){
    if(!existing)throw Error('Account not found.');
    const [member]=await tx`select * from course_private.memberships where user_id=${existing.id} and active=true`;
    if(!member)throw Error('Account access is inactive.');
    await authApi('admin/users/'+existing.id,{password:b.password},'PUT');userId=existing.id;
    await tx`delete from auth.sessions where user_id=${userId}`;
   }else{
    if(existing)throw Error('This email already has an account. Ask the administrator for a recovery link.');
    const user=await authApi('admin/users',{email:invite.email,password:b.password,email_confirm:true});userId=user.id;
    await tx`insert into course_private.memberships(user_id,role) values(${userId},${invite.role})`;
   }
   await tx`update course_private.invitations set status='accepted',accepted_by=${userId} where id=${invite.id}`;
   await tx`insert into course_private.audit_events(actor_id,action,subject_id) values(${userId},${invite.purpose==='recovery'?'account_recovered':'invitation_accepted'},${invite.id})`;
   return {email:invite.email};
  }));
 }
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');if(!token)return out({error:'Please sign in.'},401);
 let user;try{user=await authApi('user',undefined,'GET',token);}catch{return out({error:'Your session has expired. Please sign in again.'},401);}
 if(!user.email_confirmed_at)return out({error:'Verify your email before continuing.'},403);
 // Auth validates the signature; checking its session row makes revoked access immediate.
 let claims;try{claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{return out({error:'Invalid session.'},401);}
 const [session]=await sql`select id from auth.sessions where id=${claims.session_id} and user_id=${user.id}`;
 if(!session)return out({error:'Your session has ended. Please sign in again.'},401);
 // Only Auth-verified users with a live session can self-enrol. Roles never come from metadata.
 const member=await sql.begin(async tx=>{
  const inserted=await tx`insert into course_private.memberships(user_id,role) values(${user.id},'learner') on conflict(user_id) do nothing returning user_id`;
  if(inserted.length)await tx`insert into course_private.audit_events(actor_id,action,subject_id) values(${user.id},'self_registration',${user.id})`;
  const [existing]=await tx`select * from course_private.memberships where user_id=${user.id}`;
  return existing;
 });
 if(!member?.active)return out({error:'Your course access is inactive. Contact the administrator.'},403);
 const admin=member.role==='admin';

 if(action==='admin.deleteAccount'){
  if(!admin)return out({error:'Administrator access required.'},403);
  if(!/^[0-9a-f-]{36}$/i.test(b.id||''))throw Error('Invalid account.');
  if(b.id===user.id)throw Error('You cannot delete your own account.');
  await sql.begin(async tx=>{
   const [target]=await tx`select u.id,u.email,m.role from auth.users u left join course_private.memberships m on m.user_id=u.id where u.id=${b.id} for update of u`;
   if(!target)throw Error('Account not found.');
   if(target.role==='admin')throw Error('Administrator accounts cannot be deleted here.');
   if(typeof b.confirmEmail!=='string'||b.confirmEmail.trim().toLowerCase()!==target.email.toLowerCase())throw Error('Type the learner’s email address to confirm deletion.');
   await tx`delete from auth.sessions where user_id=${b.id}`;
   await tx`delete from course_private.invitations where accepted_by=${b.id} or invited_by=${b.id} or lower(email)=lower(${target.email})`;
   await tx`delete from course_private.issued_certificates where user_id=${b.id}`;
   await tx`delete from course_private.audit_events where actor_id=${b.id} or subject_id=${b.id}`;
   await tx`delete from public.activity_progress where enrolment_id in(select id from public.enrolments where user_id=${b.id})`;
   await tx`delete from public.assessment_attempts where enrolment_id in(select id from public.enrolments where user_id=${b.id})`;
   await tx`delete from public.certificates where enrolment_id in(select id from public.enrolments where user_id=${b.id})`;
   await tx`delete from public.enrolments where user_id=${b.id}`;
   await tx`delete from auth.users where id=${b.id}`;
   await tx`insert into course_private.audit_events(actor_id,action,subject_id) values(${user.id},'account_deleted',${b.id})`;
  });
  return out({ok:true});
 }

 if(action==='admin.list'){
  if(!admin)return out({error:'Administrator access required.'},403);
  const learners=await sql`select u.id as user_id,coalesce(m.role,'learner') as role,m.active,u.email,p.full_name,p.mcr_number,p.postgraduate_year,p.specialty,p.organisation,r.record,c.id as certificate_id,c.revoked_at from auth.users u left join course_private.memberships m on m.user_id=u.id left join public.learner_profiles p on p.user_id=u.id left join course_private.learning_records r on r.user_id=u.id left join course_private.issued_certificates c on c.user_id=u.id and c.course_version='3.0' order by m.created_at desc`;
  const invitations=await sql`select id,email,role,status,purpose,expires_at from course_private.invitations order by created_at desc limit 500`;
  return out({learners,invitations});
 }
 if(action==='admin.invite'){
  if(!admin)return out({error:'Administrator access required.'},403);
  const emails=[...new Set((Array.isArray(b.emails)?b.emails:[]).map((s:any)=>String(s).trim().toLowerCase()))];
  if(!emails.length||emails.length>100||emails.some(e=>!/^\S+@\S+\.\S+$/.test(e)||e.length>254))throw Error('Provide up to 100 valid email addresses.');
  const purpose=b.purpose==='recovery'?'recovery':'invite';const links=[];
  for(const email of emails){
   const [existing]=await sql`select id from auth.users where lower(email)=${email}`;
   if((purpose==='invite'&&existing)||(purpose==='recovery'&&!existing)){links.push({email,error:existing?'Account exists; use a recovery link.':'No account exists for this email.'});continue;}
   const secret=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(v=>v.toString(16).padStart(2,'0')).join('');
   const digest=await hash(secret);
   await sql.begin(async tx=>{await tx`update course_private.invitations set status='revoked' where email=${email} and status='pending'`;const [r]=await tx`insert into course_private.invitations(email,role,token_hash,expires_at,invited_by,purpose) values(${email},'learner',${digest},now()+interval '7 days',${user.id},${purpose}) returning id`;await tx`insert into course_private.audit_events(actor_id,action,subject_id) values(${user.id},${purpose==='invite'?'invitation_created':'recovery_created'},${r.id})`;});
   links.push({email,url:site+'/#accept/'+secret});
  }return out({links});
 }
 if(action==='admin.revokeInvite'||action==='admin.access'||action==='admin.revokeCertificate'){
  if(!admin)return out({error:'Administrator access required.'},403);
  if(!/^[0-9a-f-]{36}$/i.test(b.id||''))throw Error('Invalid record.');
  if(action==='admin.access'&&b.id===user.id)throw Error('You cannot deactivate your own account.');
  await sql.begin(async tx=>{
   if(action==='admin.revokeInvite')await tx`update course_private.invitations set status='revoked' where id=${b.id} and status='pending'`;
   if(action==='admin.access'){await tx`update course_private.memberships set active=${b.active===true} where user_id=${b.id}`;if(b.active!==true)await tx`delete from auth.sessions where user_id=${b.id}`;}
   if(action==='admin.revokeCertificate')await tx`update course_private.issued_certificates set revoked_at=now() where id=${b.id}`;
   await tx`insert into course_private.audit_events(actor_id,action,subject_id) values(${user.id},${action},${b.id})`;
  });return out({ok:true});
 }
 if(action==='profile'){
  const p=b.profile||{};
  for(const field of ['full_name','organisation','mcr_number','specialty'])if(typeof p[field]!=='string'||!p[field].trim()||p[field].length>150)throw Error('Complete all profile fields.');
  if(!Number.isInteger(p.postgraduate_year)||p.postgraduate_year<1||p.postgraduate_year>80)throw Error('Enter a valid postgraduate year.');
  await sql`insert into public.learner_profiles(user_id,full_name,organisation,mcr_number,specialty,postgraduate_year) values(${user.id},${p.full_name.trim()},${p.organisation.trim()},${p.mcr_number.trim()},${p.specialty.trim()},${p.postgraduate_year}) on conflict(user_id) do update set full_name=excluded.full_name,organisation=excluded.organisation,mcr_number=excluded.mcr_number,specialty=excluded.specialty,postgraduate_year=excluded.postgraduate_year`;
 }
 const [profile]=await sql`select * from public.learner_profiles where user_id=${user.id}`;
 await sql`insert into course_private.learning_records(user_id,record) values(${user.id},${sql.json(fresh())}) on conflict do nothing`;
 return out(await sql.begin(async tx=>{
  const [row]=await tx`select record from course_private.learning_records where user_id=${user.id} for update`;
  const s=row.record;const current=()=>s.attempts.at(-1);
  if(!['me','profile'].includes(action)&&!profile)throw Error('Complete your learner profile first.');
  if(action==='warmup'){
   if(s.pre)throw Error('Your warm-up has already been recorded.');s.pre=validateEvaluation(b,content);
  }
  if(!['me','profile','warmup'].includes(action)&&!s.pre)throw Error('Complete the clinical warm-up first.');
  if(action==='content')return {lessons:content.lessonData.map(l=>({...l,checkpoint:sanitise(l.checkpoint)})),cases:Object.fromEntries(Object.entries(content.cases).map(([id,c]:any)=>[id,{...c,steps:c.steps.map(sanitise)}])),caseOrder:content.caseOrder,videos:content.videos,refs:content.refs};
  if(action==='lesson'){
   const l=content.lessonData.find(l=>l.id===b.id);if(!l||!Number.isInteger(b.choice)||b.choice<0||b.choice>=l.checkpoint.options.length)throw Error('Choose a valid answer.');
   const correct=b.choice===l.checkpoint.answer;if(correct){s.lessons[l.id]=new Date().toISOString();if(s.revision.includes(l.id)&&!s.revisionDone.includes(l.id))s.revisionDone.push(l.id);}b.result={correct,why:l.checkpoint.why,answer:l.checkpoint.answer};
  }
  if(action==='case'){
   const c=content.cases[b.id];if(!c)throw Error('Patient journey not found.');const responses=s.cases[b.id]||[];
   if(b.index!==responses.length)throw Error('This decision has already been recorded. Refresh your course record.');
   const q=c.steps[b.index];if(!q)throw Error('This journey is complete.');const points=score(q,b.values);responses.push({values:b.values,points,at:new Date().toISOString()});s.cases[b.id]=responses;
   b.result={points,why:q.why,transfer:q.transfer,answer:q.answer};
  }
  if(action==='case.review'){const c=content.cases[b.id];if(!c||s.cases[b.id]?.length!==c.steps.length)throw Error('Complete this patient journey before reviewing it.');return {patient:c,responses:s.cases[b.id]};}
  if(action==='exam.start'){
   if(!content.lessonData.every(l=>s.lessons[l.id])||!content.caseOrder.every(id=>s.cases[id]?.length===content.cases[id].steps.length))throw Error('Complete the teaching and patient journeys first.');
   if(s.revision.some(id=>!s.revisionDone.includes(id)))throw Error('Complete your targeted revision before retaking the assessment.');
   if(!current()||current().finished)s.attempts.push({id:crypto.randomUUID(),startedAt:new Date().toISOString(),answers:[],finished:false});
  }
  if(action==='exam.question'||action==='exam.start'){
   const a=current();if(!a||a.finished)throw Error('Start an assessment first.');const index=a.answers.length,q=content.challenge.steps[index];
   b.result={attemptId:a.id,index,total:30,question:sanitise(q),context:index%3&&![6,8,9].includes(q.groupIndex)&&!(q.groupIndex===5&&index%3===2)?content.challenge.steps.slice(index-index%3,index).map(q=>q.text):[]};
  }
  if(action==='exam.answer'){
   const a=current();if(!a||a.finished||a.id!==b.attemptId||a.answers.length!==b.index)throw Error('This decision has already been recorded. Reload to continue.');
   const q=content.challenge.steps[b.index];a.answers.push({values:b.values,points:score(q,b.values),at:new Date().toISOString()});
   if(a.answers.length===30){a.finished=true;a.finishedAt=new Date().toISOString();a.score=a.answers.reduce((n,r)=>n+r.points,0);a.passed=passes(a.score);s.revision=a.passed?[]:[...new Set(content.challenge.steps.flatMap((q,i)=>a.answers[i].points<1?content.domainLessons[q.domain]||[]:[]))];s.revisionDone=[];}
  }
  if(action==='exam.review'){
   const a=s.attempts.find(a=>a.id===b.id&&a.finished);if(!a)throw Error('Submit the assessment before opening feedback.');
   return {attempt:a,questions:content.challenge.steps,revision:s.revision};
  }
  if(action==='reflection'){
   if(!s.attempts.some(a=>a.finished))throw Error('Complete the final assessment first.');if(s.post)throw Error('Your reflection has already been submitted.');s.post=validateEvaluation(b,content);
  }
  if(action==='reflection.review'){
   if(!s.post)throw Error('Complete your reflection first.');return {pre:s.pre,post:s.post,questions:content.anchorItems};
  }
  if(action==='certificate'){
   if(!eligible(s,content))throw Error('Complete the warm-up, all teaching and patient journeys, pass the assessment, and submit your reflection first.');
   const best=Math.max(...s.attempts.filter(a=>a.finished).map(a=>a.score));
   await tx`insert into course_private.issued_certificates(user_id,course_version,learner_name,score) values(${user.id},'3.0',${profile.full_name},${best}) on conflict(user_id,course_version) do nothing`;
   const [cert]=await tx`select * from course_private.issued_certificates where user_id=${user.id} and course_version='3.0'`;
   if(cert.revoked_at)throw Error('This certificate has been revoked. Contact the course administrator.');return {certificate:cert};
  }
  const allowed=['me','profile','warmup','lesson','case','exam.start','exam.question','exam.answer','reflection'];
  if(!allowed.includes(action))throw Error('Unknown course action.');
  if(!['me','profile','exam.question'].includes(action))await tx`update course_private.learning_records set record=${tx.json(s)},updated_at=now() where user_id=${user.id}`;
  return {role:member.role,email:user.email,profile:profile||null,record:view(s),result:b.result,anchors:content.anchorItems.map(sanitise),confidenceAreas:content.confidenceAreas};
 }));
 }catch(e){console.error('Course request failed:',e.message);return out({error:e.message||'Unable to complete this request.'},400);}
});
