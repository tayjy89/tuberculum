import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('public-course/assets',{recursive:true});
for(const f of ['index.html','style.css','accounts.css','config.js','portal.js'])await copyFile('accounts/web/'+f,'public-course/'+f);
const r=await fetch('https://raw.githubusercontent.com/tayjy89/tuberculum/d35fd2f5838c0846ebeffc98ad04f7f574900568/assets/cxr-illustrations.png');
if(!r.ok)throw Error('Unable to retrieve CXR illustration');
const b=Buffer.from(await r.arrayBuffer());
if(createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex')!=='d36498d8d8baa627ab2edaa0072aa997f8779550')throw Error('CXR asset integrity mismatch');
await writeFile('public-course/assets/cxr-illustrations.png',b);
