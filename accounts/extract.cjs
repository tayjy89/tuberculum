const fs=require('fs'),vm=require('vm');
const dummy=new Proxy(function(){return dummy},{get:(t,k)=> k===Symbol.iterator?function*(){}:k==='querySelectorAll'?()=>[]:dummy,set:()=>true});
const c=vm.createContext({document:dummy,window:dummy,location:{hash:'#clinic'},history:dummy,localStorage:{getItem:()=>null,setItem(){}},crypto:require('crypto').webcrypto,console});
for(const f of ['app.js','curriculum.js','updates.js','video-scripts.js','policy.js','course.js','evaluation.js'])vm.runInContext(fs.readFileSync(__dirname+'/../'+f,'utf8').replace(/\brender\(\);/g,''),c,{filename:f});
const data=vm.runInContext('JSON.stringify({refs,videos,cases,caseOrder,lessonData,challenge,anchorItems,confidenceAreas,domainLessons,domains})',c);
fs.writeFileSync(__dirname+'/server/content.json',data);
console.log('Extracted',JSON.parse(data).challenge.steps.length,'assessment items');
