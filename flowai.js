/* flowai.js - Flow AI (online) for DJ Flow Pro */

let aiKey='';
let aiModel='';
let aiShare=true;
let flowHistory=[];
try{
 aiKey=localStorage.getItem('djflow_ai_key')||'';
 aiModel=localStorage.getItem('djflow_ai_model')||'';
 aiShare=(localStorage.getItem('djflow_ai_share')||'1')==='1';
}catch(e){}

function aiSave(k,v){
 try{localStorage.setItem(k,v)}catch(e){}
}

/* ----- Flow chat: small upgrades (replace the old versions) ----- */
function flowAdd(text,who,buttons){
 const box=document.getElementById('flowMessages');
 const bubble=document.createElement('div');
 bubble.className='bubble '+who;
 bubble.textContent=text;
 (buttons||[]).forEach(item=>{
  const btn=document.createElement('button');
  btn.textContent=item.label;
  btn.onclick=item.action;
  bubble.append(btn);
 });
 box.append(bubble);
 box.scrollTop=box.scrollHeight;
 return bubble;
}

function flowNewChat(){
 document.getElementById('flowMessages').innerHTML='';
 flowPending=null;
 flowHistory=[];
 flowHello();
}

/* ----- More tab: Flow AI settings ----- */
function buildMorePage(){
 document.getElementById('page-more').innerHTML=`
  <h2>☰ More</h2>
  <div class="chatbox">
   <h3 style="margin-top:0">🤖 Flow AI (online)</h3>
   <p id="aiStatus" style="font-size:13px;color:#aeb5ca"></p>
   <input id="aiKey" type="password" autocomplete="off" placeholder="Paste your Gemini key here">
   <input id="aiModel" placeholder="Model name (tap Find model for me)">
   <label style="font-size:14px;display:flex;align-items:center">
    <input id="aiShare" type="checkbox" style="width:auto;margin:0 8px 0 0">
    Let Flow see my song names
   </label>
   <div class="actions" style="margin-top:8px">
    <button onclick="findAIModel()">🔎 Find model for me</button>
    <button onclick="saveAISettings()">💾 Save</button>
    <button onclick="testAI()">✅ Test Flow AI</button>
    <button onclick="removeAIKey()" style="background:#2f3a5c;color:white">Remove key</button>
   </div>
   <div class="chatnote">
    Your key is saved only on this phone. Never share it with anyone. The free plan has limits, and Google may use free-plan questions to improve its products. If "Let Flow see my song names" is on, your song names are sent with your questions. AI answers can be wrong, so double-check important facts.
   </div>
  </div>
  <div class="soon" style="margin-top:12px">More settings will be added here later.</div>
 `;
 document.getElementById('aiModel').value=aiModel;
 document.getElementById('aiShare').checked=aiShare;
 updateAIStatus('');
}

function updateAIStatus(extra){
 const el=document.getElementById('aiStatus');
 if(!el)return;
 el.textContent=(aiKey?'🔑 Key saved on this phone. ':'No key saved yet. ')+
  (aiModel?'Model: '+aiModel+'. ':'No model chosen yet. ')+(extra||'');
 document.getElementById('aiKey').placeholder=
  aiKey?'Key saved ✅ (paste a new one to replace it)':'Paste your Gemini key here';
}

function saveAISettings(){
 const k=document.getElementById('aiKey').value.trim();
 const m=document.getElementById('aiModel').value.trim();
 if(k){aiKey=k;aiSave('djflow_ai_key',k)}
 aiModel=m;
 aiSave('djflow_ai_model',m);
 aiShare=document.getElementById('aiShare').checked;
 aiSave('djflow_ai_share',aiShare?'1':'0');
 document.getElementById('aiKey').value='';
 updateAIStatus('Saved. Now tap Test Flow AI.');
}

function removeAIKey(){
 aiKey='';
 try{localStorage.removeItem('djflow_ai_key')}catch(e){}
 flowHistory=[];
 updateAIStatus('Key removed.');
}

function aiErrorText(status,data){
 const msg=(data&&data.error&&data.error.message)||'';
 if(status===400&&/API key/i.test(msg))return 'Your key was not accepted. Check that you copied all of it.';
 if(status===400)return 'Google rejected the request: '+msg;
 if(status===401||status===403)return 'Google says this key is not allowed to do that. Check the key, or whether it needs billing set up.';
 if(status===404)return 'That model name was not found. Tap Find model for me, then Save.';
 if(status===429)return 'The free limit was reached. Wait a minute (or until tomorrow) and try again.';
 if(status>=500)return 'Google is busy right now. Try again soon.';
 return 'Something went wrong ('+status+'). '+msg;
}

function aiFailText(e){
 if(e&&e.name==='TypeError')return 'Could not reach Google. Check your internet connection.';
 return (e&&e.message)||'Something went wrong.';
}

async function findAIModel(){
 const k=document.getElementById('aiKey').value.trim()||aiKey;
 if(!k){updateAIStatus('Paste your key first.');return}
 updateAIStatus('Looking for a model...');
 try{
  const res=await fetch(
   'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
   {headers:{'x-goog-api-key':k}}
  );
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(aiErrorText(res.status,data));
  const names=(data.models||[])
   .filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent'))
   .map(m=>m.name.replace('models/',''))
   .filter(n=>/flash/.test(n)&&!/image|tts|live|audio|embed|robot|computer|exp|thinking|native/.test(n));
  if(!names.length)throw new Error('No suitable model was found for this key.');
  const score=n=>{
   const v=parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/)||[0,0])[1]);
   return (/preview/.test(n)?0:1000)+v*10+(/lite/.test(n)?0:1);
  };
  names.sort((a,b)=>score(b)-score(a));
  document.getElementById('aiModel').value=names[0];
  updateAIStatus('Found: '+names.slice(0,4).join(', ')+'. Picked '+names[0]+'. Now tap Save, then Test.');
 }catch(e){
  updateAIStatus('❌ '+aiFailText(e));
 }
}

function cleanAI(t){
 return t
  .replace(/\*\*(.+?)\*\*/g,'$1')
  .replace(/^\s*[\*\-]\s+/gm,'• ')
  .replace(/^#+\s*/gm,'')
  .replace(/`/g,'')
  .trim();
}

function flowSystemPrompt(){
 let s="You are Flow, the friendly DJ assistant inside the DJ Flow Pro app. You help DJs plan music for church programs, parties and events, and you can also answer general questions. Rules: be accurate. If you are not sure, say so clearly instead of guessing. Never invent facts, song titles or artists. Use simple friendly English. Keep answers short and easy to read on a phone (under about 120 words unless the person asks for more). Do not use tables.";
 if(flowName)s+=" The person's name is "+flowName+".";
 if(aiShare&&library.length){
  const lines=library.slice(0,60).map(x=>
   x.name+' ('+x.category+(x.duration?', '+fmt(x.duration):'')+')'
  );
  s+=" The person's song library, to use when they ask for suggestions: "+lines.join('; ')+".";
 }
 return s;
}

async function askGemini(question){
 const contents=flowHistory.slice(-10)
  .concat([{role:'user',parts:[{text:question}]}]);
 const res=await fetch(
  'https://generativelanguage.googleapis.com/v1beta/models/'+
   encodeURIComponent(aiModel)+':generateContent',
  {
   method:'POST',
   headers:{'Content-Type':'application/json','x-goog-api-key':aiKey},
   body:JSON.stringify({
    system_instruction:{parts:[{text:flowSystemPrompt()}]},
    contents:contents
   })
  }
 );
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(aiErrorText(res.status,data));
 const cand=data.candidates&&data.candidates[0];
 const parts=cand&&cand.content&&cand.content.parts;
 const text=parts?parts.map(p=>p.text||'').join(''):'';
 if(!text)throw new Error('Flow got an empty answer. Try asking in a different way.');
 flowHistory.push({role:'user',parts:[{text:question}]});
 flowHistory.push({role:'model',parts:[{text:text}]});
 return cleanAI(text);
}

async function testAI(){
 if(!aiKey){updateAIStatus('Save your key first.');return}
 if(!aiModel){updateAIStatus('Tap Find model for me first, then Save.');return}
 updateAIStatus('Testing...');
 try{
  const a=await askGemini('Say hello in one short sentence and tell me you are Flow.');
  flowHistory=[];
  updateAIStatus('✅ It works! Flow said: '+a);
 }catch(e){
  updateAIStatus('❌ '+aiFailText(e));
 }
}

function aiReady(){
 return !!(aiKey&&aiModel&&navigator.onLine);
}

/* ----- Flow brain (replaces the old flowReply) ----- */
function flowReply(text){
 const t=text.toLowerCase();
 const mins=flowMinutes(text);
 const cat=flowCategory(text);

 const nm=text.match(/(?:\bi am|\bi'm|\bim|my name is)\s+([a-z]+)/i);
 const notNames=/^(planning|looking|trying|going|ready|here|new|a|an|the|not|just|so|very|good|fine|ok|okay|back|wanting|needing)$/i;
 if(nm&&!mins&&!cat&&!notNames.test(nm[1])&&text.split(/\s+/).length<=6){
  flowName=nm[1].charAt(0).toUpperCase()+nm[1].slice(1).toLowerCase();
  try{localStorage.setItem('djflow_name',flowName)}catch(e){}
  flowAdd('Nice to meet you, '+flowName+'! 👋 What are we planning today—a church program, a party, or something else?','flow');
  return;
 }

 if(/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/.test(t)&&!mins&&!cat){
  flowHello();
  return;
 }

 if(flowPending){
  const n=t.match(/^\s*(\d+)\s*$/);
  if(n){
   const c=flowPending.cat;
   flowPending=null;
   flowPlan(parseInt(n[1],10),c);
   return;
  }
 }

 const wantsPlan=/plan|playlist|lineup|line-up|set ?list/.test(t);
 if(mins&&(cat||wantsPlan||flowPending||!aiReady())){
  const useCat=cat||(flowPending&&flowPending.cat)||null;
  flowPending=null;
  flowPlan(mins,useCat);
  return;
 }

 if(aiReady()){
  const waiting=flowAdd('Flow is thinking... 💭','flow');
  askGemini(text).then(answer=>{
   waiting.textContent=answer;
   const box=document.getElementById('flowMessages');
   box.scrollTop=box.scrollHeight;
  }).catch(e=>{
   waiting.textContent='😕 '+aiFailText(e)+'\n\nI can still plan music from your library without internet.';
  });
  return;
 }

 if(/mix|crossfad|transition|blend/.test(t)){
  flowAdd("Here is how to mix with Deck A and Deck B on the Home tab:\n\n1. Load a song in Deck A and press play.\n2. Load your next song in Deck B (don't play it yet).\n3. Slide the crossfader fully left so only Deck A is heard.\n4. When Deck A is near the end, press play on Deck B and slowly slide the crossfader to the right.\n5. When only Deck B is heard, load the next song in Deck A.\n\nTip: songs with a similar speed (BPM) blend more smoothly.",'flow',
   [{label:'🎧 Go to decks',action:()=>showPage('home')}]);
  return;
 }

 if(cat){
  flowPending={cat:cat};
  if(/program|service/.test(t)){
   flowAdd("A church program usually flows like this:\n1. Opening praise: lively, joyful songs\n2. Worship: slower, deeper songs\n3. Offering or response: soft and steady\n4. Closing: uplifting songs\n\nHow many minutes should the music be? Just send a number, like 40.",'flow');
  }else{
   flowAdd('Got it, '+(cat==='Christian'?'praise and worship':'party')+' music. How many minutes should I plan? Just send a number, like 30.','flow');
  }
  return;
 }

 if(/help|what can you do/.test(t)){
  flowAdd("I can help you:\n• Plan music by time and type, like \"Plan 40 minutes of worship\" or \"1 hour party\"\n• Explain how to mix with Deck A and Deck B\n• Remember your name\n• Answer any question when you are online (add your Gemini key in More)\n\nTry one of the buttons below the chat!",'flow');
  return;
 }

 let tip='\n\nTip: add a Gemini key in More → Flow AI and I can answer any question when you are online.';
 if(aiKey&&!navigator.onLine)tip='\n\nYou are offline, so I can only plan music and explain mixing right now.';
 if(aiKey&&navigator.onLine&&!aiModel)tip='\n\nOpen More → Flow AI, tap Find model for me, then Save.';
 flowAdd("I'm not sure I understood that yet. Try something like \"Plan 40 minutes of worship\" or \"1 hour party\"."+tip,'flow');
}

buildMorePage();
/* ----- Auto-retry and fallback models (newer version of askGemini) ----- */
function aiSleep(ms){
 return new Promise(r=>setTimeout(r,ms));
}

async function aiCandidateModels(){
 try{
  const res=await fetch(
   'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
   {headers:{'x-goog-api-key':aiKey}}
  );
  const data=await res.json().catch(()=>({}));
  if(!res.ok)return [];
  const names=(data.models||[])
   .filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent'))
   .map(m=>m.name.replace('models/',''))
   .filter(n=>/flash/.test(n)&&!/image|tts|live|audio|embed|robot|computer|exp|thinking|native/.test(n));
  const score=n=>{
   const v=parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/)||[0,0])[1]);
   return (/preview/.test(n)?0:1000)+v*10+(/lite/.test(n)?0:1);
  };
  return names.sort((a,b)=>score(b)-score(a));
 }catch(e){
  return [];
 }
}

async function aiTryModel(model,question){
 const contents=flowHistory.slice(-10)
  .concat([{role:'user',parts:[{text:question}]}]);
 const res=await fetch(
  'https://generativelanguage.googleapis.com/v1beta/models/'+
   encodeURIComponent(model)+':generateContent',
  {
   method:'POST',
   headers:{'Content-Type':'application/json','x-goog-api-key':aiKey},
   body:JSON.stringify({
    system_instruction:{parts:[{text:flowSystemPrompt()}]},
    contents:contents
   })
  }
 );
 const data=await res.json().catch(()=>({}));
 if(!res.ok){
  const err=new Error(aiErrorText(res.status,data));
  err.status=res.status;
  throw err;
 }
 const cand=data.candidates&&data.candidates[0];
 const parts=cand&&cand.content&&cand.content.parts;
 const text=parts?parts.map(p=>p.text||'').join(''):'';
 if(!text)throw new Error('Flow got an empty answer. Try asking in a different way.');
 return text;
}

async function askGemini(question){
 let models=[aiModel];
 let lastErr=null;
 for(let i=0;i<models.length&&i<4;i++){
  const model=models[i];
  for(let attempt=0;attempt<2;attempt++){
   try{
    const text=await aiTryModel(model,question);
    if(model!==aiModel){
     aiModel=model;
     aiSave('djflow_ai_model',model);
     const box=document.getElementById('aiModel');
     if(box)box.value=model;
     updateAIStatus('Switched to '+model+' because the first model was busy.');
    }
    flowHistory.push({role:'user',parts:[{text:question}]});
    flowHistory.push({role:'model',parts:[{text:text}]});
    return cleanAI(text);
   }catch(e){
    lastErr=e;
    const retryable=e.status>=500||e.status===429||e.status===404;
    if(!retryable)throw e;
    if(e.status>=500&&attempt===0){
     await aiSleep(1500);
     continue;
    }
    break;
   }
  }
  if(i===0&&models.length===1){
   const more=await aiCandidateModels();
   models=[aiModel].concat(more.filter(n=>n!==aiModel));
  }
 }
 throw lastErr||new Error('Flow could not get an answer.');
}

/* ----- Fix: timeouts + faster answers (paste at the very end) ----- */
async function aiCall(model,question,lowThinking){
 const contents=flowHistory.slice(-10)
  .concat([{role:'user',parts:[{text:question}]}]);
 const body={
  system_instruction:{parts:[{text:flowSystemPrompt()}]},
  contents:contents
 };
 if(lowThinking){
  body.generationConfig={thinkingConfig:{thinkingLevel:'low'}};
 }
 const ctrl=new AbortController();
 const timer=setTimeout(()=>ctrl.abort(),25000);
 const timeoutError=()=>{
  const err=new Error('Google took too long to answer ('+model+'). Try again, or pick another model in More.');
  err.status=504;
  return err;
 };
 try{
  const res=await fetch(
   'https://generativelanguage.googleapis.com/v1beta/models/'+
    encodeURIComponent(model)+':generateContent',
   {
    method:'POST',
    headers:{'Content-Type':'application/json','x-goog-api-key':aiKey},
    body:JSON.stringify(body),
    signal:ctrl.signal
   }
  );
  const data=await res.json().catch(()=>({}));
  if(ctrl.signal.aborted)throw timeoutError();
  if(!res.ok){
   const err=new Error(aiErrorText(res.status,data));
   err.status=res.status;
   throw err;
  }
  const cand=data.candidates&&data.candidates[0];
  const parts=cand&&cand.content&&cand.content.parts;
  const text=parts?parts.map(p=>p.text||'').join(''):'';
  if(!text)throw new Error('Flow got an empty answer. Try asking in a different way.');
  return text;
 }catch(e){
  if(e&&e.name==='AbortError')throw timeoutError();
  throw e;
 }finally{
  clearTimeout(timer);
 }
}

async function aiTryModel(model,question){
 const low=/gemini-3/.test(model);
 try{
  return await aiCall(model,question,low);
 }catch(e){
  if(low&&e.status===400&&/think/i.test(e.message||'')){
   return await aiCall(model,question,false);
  }
  throw e;
 }
}

/* ----- Fix 2: Flow never waits more than about 40 seconds ----- */
function aiSayThinking(msg){
 const bubbles=document.querySelectorAll('#flowMessages .bubble.flow');
 for(let i=bubbles.length-1;i>=0;i--){
  if(bubbles[i].textContent.indexOf('Flow is thinking')===0){
   bubbles[i].textContent=msg;
   break;
  }
 }
}

function aiRace(promise,ms,message){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{
   const err=new Error(message);
   err.status=504;
   reject(err);
  },ms);
  promise.then(
   v=>{clearTimeout(timer);resolve(v)},
   e=>{clearTimeout(timer);reject(e)}
  );
 });
}

async function aiCandidateModels(){
 try{
  const res=await aiRace(
   fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
    {headers:{'x-goog-api-key':aiKey}}),
   8000,'Could not load the model list.'
  );
  const data=await res.json().catch(()=>({}));
  if(!res.ok)return [];
  const names=(data.models||[])
   .filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent'))
   .map(m=>m.name.replace('models/',''))
   .filter(n=>/flash/.test(n)&&!/image|tts|live|audio|embed|robot|computer|exp|thinking|native/.test(n));
  const score=n=>{
   const v=parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/)||[0,0])[1]);
   return (/preview/.test(n)?0:1000)+v*10+(/lite/.test(n)?0:1);
  };
  return names.sort((a,b)=>score(b)-score(a));
 }catch(e){
  return [];
 }
}

async function askGemini(question){
 const deadline=Date.now()+40000;
 let models=[aiModel];
 let lastErr=null;
 for(let i=0;i<models.length&&i<3;i++){
  const left=deadline-Date.now();
  if(left<5000)break;
  const model=models[i];
  aiSayThinking('Flow is thinking... ('+model+')');
  try{
   const text=await aiRace(
    aiTryModel(model,question),
    Math.min(25000,left),
    'Google took too long to answer ('+model+').'
   );
   if(model!==aiModel){
    aiModel=model;
    aiSave('djflow_ai_model',model);
    const box=document.getElementById('aiModel');
    if(box)box.value=model;
    updateAIStatus('Switched to '+model+' because the first model was busy.');
   }
   flowHistory.push({role:'user',parts:[{text:question}]});
   flowHistory.push({role:'model',parts:[{text:text}]});
   return cleanAI(text);
  }catch(e){
   lastErr=e;
   const retryable=e.status>=500||e.status===429||e.status===404;
   if(!retryable)throw e;
   if(i===0&&models.length===1){
    const more=await aiCandidateModels();
    models=[aiModel].concat(more.filter(n=>n!==aiModel));
   }
  }
 }
 if(lastErr&&lastErr.status===504){
  throw new Error('Google is not answering from this phone right now. Try Wi-Fi or mobile data, wait a minute, and ask again.');
 }
 throw lastErr||new Error('Flow could not get an answer in time.');
}