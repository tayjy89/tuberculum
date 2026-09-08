export function score(q,values){
 if(!Array.isArray(values)||!values.length||!values.every(Number.isFinite)||new Set(values).size!==values.length)throw Error('Select a valid response.');
 if(q.type==='prescription'){if(values.length!==q.answer.length)throw Error('Complete every prescription field.');return values.every((v,i)=>v===q.answer[i])?1:0;}
 if(values.some(v=>!Number.isInteger(v)||v<0||v>=q.options.length)||(!q.multi&&values.length!==1))throw Error('Select a valid response.');
 if(!q.multi)return values[0]===q.answer[0]?1:0;
 const hit=values.filter(v=>q.answer.includes(v)).length/q.answer.length;
 const wrong=q.options.length-q.answer.length;
 return Math.max(0,hit-(wrong?values.filter(v=>!q.answer.includes(v)).length/wrong:0));
}
export function passes(points){return Number.isFinite(points)&&points>=21;}
export function sanitise(q){const {answer,why,transfer,...rest}=q;return rest;}
export function validateEvaluation(input,content){
 const answers={}; for(const q of content.anchorItems){const v=input.answers?.[q.id];if(!Number.isInteger(v)||v<0||v>q.options.length)throw Error('Answer all ten decisions.');answers[q.id]=v;}
 const confidence={};for(const [id] of content.confidenceAreas){const v=input.confidence?.[id];if(v!==null&&(!Number.isInteger(v)||v<1||v>5))throw Error('Complete the confidence ratings.');confidence[id]=v;}
 return {answers,confidence,score:content.anchorItems.reduce((n,q)=>n+(answers[q.id]===q.answer?1:0),0),feedback:typeof input.feedback==='string'?input.feedback.slice(0,4000):'',completedAt:new Date().toISOString()};
}
export function eligible(s,c){return !!s.pre&&c.lessonData.every(l=>s.lessons?.[l.id])&&c.caseOrder.every(id=>s.cases?.[id]?.length===c.cases[id].steps.length)&&s.attempts?.some(a=>a.finished&&passes(a.score))&&!!s.post;}
export function fresh(){return {pre:null,post:null,lessons:{},cases:{},attempts:[],revision:[],revisionDone:[],drafts:{}};}
