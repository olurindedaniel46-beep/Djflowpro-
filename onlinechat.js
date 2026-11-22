/* onlinechat.js - Online DJ Chat for DJ Flow Pro (Firebase free plan, text only) */

let ocCfg=null;
let ocSession=null;
let ocToken='';
let ocTokenExp=0;
let ocProfile=null;
let ocAdmin=null;
let ocView='';
let ocMode='login';
let ocCurrent=null;
let ocMsgs=[];
let ocShown=new Set();
let ocLastTs=0;
let ocTick=0;
let ocPollCount=0;
let ocChats=[];

try{ocCfg=JSON.parse(localStorage.getItem('djflow_fb')||'null')}catch(e){}
try{ocSession=JSON.parse(localStorage.getItem('djflow_session')||'null')}catch(e){}

function ocEl(id){return document.getElementById(id)}
function ocNote(t){const e=ocEl('ocNote');if(e)e.textContent=t||''}

function ocShow(view){
 ocView=view;
 ['Setup','Auth','Profile','List','Chat'].forEach(v=>{
  ocEl('oc'+v+'View').style.display=(v.toLowerCase()===view)?'block':'none';
 });
 ocNote('');
}

function ocFail(e){
 if(!navigator.onLine)return 'You are offline. Online chat needs internet.';
 if(e&&e.name==='TypeError')return 'Could not reach the server. Check your internet and the databaseURL in Server settings.';
 return (e&&e.message)||'Something went wrong.';
}

function ocAuthErr(data){
 const m=(data&&data.error&&data.error.message)||'';
 if(/EMAIL_EXISTS/.test(m))return 'That email is already registered. Try signing in.';
 if(/INVALID_EMAIL/.test(m))return 'That email does not look right.';
 if(/WEAK_PASSWORD/.test(m))return 'Password must be at least 6 characters.';
 if(/EMAIL_NOT_FOUND|INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS/.test(m))return 'Wrong email or password.';
 if(/TOO_MANY_ATTEMPTS/.test(m))return 'Too many tries. Wait a few minutes and try again.';
 if(/OPERATION_NOT_ALLOWED/.test(m))return 'Email/Password sign-in is not turned on in Firebase (Authentication, Sign-in method).';
 if(/API key not valid|API_KEY_INVALID/i.test(m))return 'The apiKey is not valid. Check Server settings.';
 return m?('Sign-in problem: '+m):'Something went wrong. Check your internet.';
}

/* ---------- Firebase sign-in (REST) ---------- */
async function ocAuthCall(endpoint,body){
 const res=await fetch(
  'https://identitytoolkit.googleapis.com/v1/accounts:'+endpoint+'?key='+encodeURIComponent(ocCfg.apiKey),
  {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}
 );
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(ocAuthErr(data));
 return data;
}

function ocSaveSession(){
 try{localStorage.setItem('djflow_session',JSON.stringify(ocSession))}catch(e){}
}

function ocSetSession(data){
 ocToken=data.idToken;
 ocTokenExp=Date.now()+Number(data.expiresIn||3600)*1000;
 ocSession={uid:data.localId,refresh:data.refreshToken,email:data.email||''};
 ocSaveSession();
}

async function ocRefresh(){
 const res=await fetch(
  'https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(ocCfg.apiKey),
  {
   method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(ocSession.refresh)
  }
 );
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error('Your session ended. Please sign in again.');
 ocToken=data.id_token;
 ocTokenExp=Date.now()+Number(data.expires_in||3600)*1000;
 ocSession.refresh=data.refresh_token||ocSession.refresh;
 ocSession.uid=data.user_id||ocSession.uid;
 ocSaveSession();
}

async function ocGetToken(){
 if(!ocSession)throw new Error('Please sign in.');
 if(!ocToken||Date.now()>ocTokenExp-120000)await ocRefresh();
 return ocToken;
}

/* ---------- Database (REST) ---------- */
async function ocDb(method,path,body,query){
 const token=await ocGetToken();
 let url=ocCfg.dbUrl+'/'+path+'.json?auth='+encodeURIComponent(token);
 if(query)url+='&'+query;
 const opts={method:method};
 if(body!==undefined){
  opts.headers={'Content-Type':'application/json'};
  opts.body=JSON.stringify(body);
 }
 const res=await fetch(url,opts);
 const data=await res.json().catch(()=>null);
 if(!res.ok){
  const msg=(data&&data.error)||'';
  const err=new Error(
   (res.status===401||/permission/i.test(msg))
    ?'Permission denied. Check that the rules were published in Firebase (Realtime Database, Rules).'
    :'Server error ('+res.status+'). '+msg
  );
  err.status=res.status;
  throw err;
 }
 return data;
}

async function ocPublicGet(path){
 const res=await fetch(ocCfg.dbUrl+'/'+path+'.json');
 if(!res.ok)throw new Error('Could not check the username. Check the rules and Server settings.');
 return await res.json();
}

function ocDmId(a,b){
 return 'dm_'+[a,b].sort().join('_');
}

/* ---------- Build the page ---------- */
function buildOnlinePage(){
 const style=document.createElement('style');
 style.textContent=`
  .octabs{display:flex;gap:6px;margin-bottom:8px}
  .octabs button{
   background:#2f3a5c;color:white;font-weight:normal;
   padding:8px 14px;border-radius:16px;font-size:14px
  }
  .octabs button.active{background:#42e8c5;color:#10121b;font-weight:bold}
  .ocerr{color:#ffb86b;font-size:13px;min-height:18px;margin:6px 0}
  .ocmsgs{
   height:52vh;overflow-y:auto;
   display:flex;flex-direction:column;gap:6px;padding:8px;
   background:#10121b;border:1px solid #343a53;border-radius:12px
  }
 `;
 document.head.append(style);

 const page=document.createElement('section');
 page.className='page';
 page.id='page-online';
 page.innerHTML=`
  <div class="chattop">
   <h2>🌍 Online DJ Chat</h2>
   <button onclick="ocBackToDJ()">← Flow</button>
  </div>
  <p id="ocNote" class="ocerr"></p>

  <div id="ocSetupView" style="display:none">
   <div class="chatbox">
    <h3 style="margin-top:0">Connect to the chat server</h3>
    <p style="font-size:13px;color:#aeb5ca">Paste the two values from your Firebase web app: the apiKey and the databaseURL.</p>
    <input id="ocApiKey" placeholder="apiKey (starts with AIza...)" autocapitalize="none">
    <input id="ocDbUrl" placeholder="databaseURL (https://...)" autocapitalize="none">
    <button onclick="ocSaveSetup()">Save and continue</button>
    <p id="ocSetupMsg" class="ocerr"></p>
    <button id="ocSetupBack" onclick="ocShow('auth')" style="display:none;background:#2f3a5c;color:white">Back</button>
   </div>
  </div>

  <div id="ocAuthView" style="display:none">
   <div class="chatbox">
    <div class="octabs">
     <button id="ocTabLogin" class="active" onclick="ocAuthTab('login')">Sign in</button>
     <button id="ocTabReg" onclick="ocAuthTab('register')">Register</button>
    </div>
    <div id="ocRegFields" style="display:none">
     <input id="ocName" placeholder="Your name (shown in chats)" maxlength="40">
     <input id="ocUser" placeholder="Username (letters, numbers, _ )" maxlength="20" autocapitalize="none">
     <input id="ocPhone" type="tel" placeholder="Phone number (optional, not verified)">
    </div>
    <input id="ocEmail" type="email" placeholder="Email" autocapitalize="none">
    <input id="ocPass" type="password" placeholder="Password (6 or more characters)">
    <button id="ocGo" onclick="ocSubmitAuth()">Sign in</button>
    <div class="actions" style="margin-top:8px">
     <button id="ocForgot" onclick="ocForgot()" style="background:#2f3a5c;color:white">Forgot password</button>
     <button onclick="ocOpenSetup()" style="background:#2f3a5c;color:white">⚙️ Server settings</button>
    </div>
    <div class="chatnote">Your email is only used to sign in. It is never shown to other DJs. Your phone number is saved as "not verified" and is also never shown.</div>
   </div>
  </div>

  <div id="ocProfileView" style="display:none">
   <div class="chatbox">
    <h3 style="margin-top:0">Finish your profile</h3>
    <input id="ocPName" placeholder="Your name (shown in chats)" maxlength="40">
    <input id="ocPUser" placeholder="Username (letters, numbers, _ )" maxlength="20" autocapitalize="none">
    <input id="ocPPhone" type="tel" placeholder="Phone number (optional, not verified)">
    <button onclick="ocSaveProfile()">Save profile</button>
   </div>
  </div>

  <div id="ocListView" style="display:none">
   <div class="chatbox">
    <div class="convohead" style="margin-bottom:0">
     <div class="avatar" id="ocMeAvatar"></div>
     <div class="chatinfo"><strong id="ocMeName"></strong><small id="ocMeUser"></small></div>
     <button onclick="ocSignOut()" style="background:#2f3a5c;color:white">Sign out</button>
    </div>
   </div>
   <div id="ocAdminBanner" class="chatnote" style="display:none">
    No admin yet. If you are DJ DO, tap the button below. Do this before sharing the app with anyone.
    <br><button onclick="ocClaimAdmin()" style="margin-top:8px">👑 Claim admin (DJ DO)</button>
   </div>
   <p style="margin:12px 0 0;font-size:13px;color:#aeb5ca">Start a personal chat with a username:</p>
   <div class="chatrow">
    <input id="ocFind" placeholder="@username" autocapitalize="none">
    <button onclick="ocFindUser()">Chat</button>
   </div>
   <div id="ocChatList"></div>
   <div class="chatnote">Online chat goes through Google's Firebase servers. Text only. Do not share passwords or private details.</div>
  </div>

  <div id="ocChatView" style="display:none">
   <div class="convohead">
    <button onclick="ocCloseChat()">←</button>
    <div class="avatar" id="ocChatAvatar"></div>
    <div class="chatinfo"><strong id="ocChatTitle"></strong><small id="ocChatSub"></small></div>
   </div>
   <div id="ocMsgs" class="ocmsgs"></div>
   <div class="chatrow" style="margin-top:8px">
    <input id="ocInput" placeholder="Type a message" maxlength="1000"
     onkeydown="if(event.key==='Enter')ocSend()">
    <button onclick="ocSend()">Send</button>
   </div>
  </div>
 `;
 document.querySelector('main').append(page);

 const soon=document.querySelector('#page-dj .soon');
 if(soon){
  soon.innerHTML=`
   Chat with DJ DO and other DJs.
   <br><br>
   <button onclick="openOnlineChat()">🌍 Online DJ Chat</button>
   <button onclick="openChats()" style="margin-top:8px;background:#2f3a5c;color:white">📴 Notes chat (this phone only)</button>
  `;
 }
}

/* ---------- Opening and settings ---------- */
function openOnlineChat(){
 showPage('online');
 const nb=document.querySelector('#nav button[data-page="dj"]');
 if(nb)nb.classList.add('active');
 if(!ocCfg){ocOpenSetup();return}
 if(!ocSession){ocAuthTab(ocMode);ocShow('auth');return}
 if(ocView==='list'||ocView==='chat')return;
 ocEnterApp();
}

function ocBackToDJ(){
 showPage('dj');
}

function ocOpenSetup(){
 ocEl('ocApiKey').value=ocCfg?ocCfg.apiKey:'';
 ocEl('ocDbUrl').value=ocCfg?ocCfg.dbUrl:'';
 ocEl('ocSetupMsg').textContent='';
 ocEl('ocSetupBack').style.display=ocCfg?'block':'none';
 ocShow('setup');
}

function ocSaveSetup(){
 const key=ocEl('ocApiKey').value.trim();
 const url=ocEl('ocDbUrl').value.trim().replace(/\/+$/,'');
 if(!key||!/^https:\/\/.+/.test(url)){
  ocEl('ocSetupMsg').textContent='Paste both values. The databaseURL must start with https://';
  return;
 }
 ocCfg={apiKey:key,dbUrl:url};
 try{localStorage.setItem('djflow_fb',JSON.stringify(ocCfg))}catch(e){}
 ocSession=null;
 ocToken='';
 try{localStorage.removeItem('djflow_session')}catch(e){}
 ocAuthTab('login');
 ocShow('auth');
}

function ocAuthTab(mode){
 ocMode=mode;
 ocEl('ocTabLogin').classList.toggle('active',mode==='login');
 ocEl('ocTabReg').classList.toggle('active',mode==='register');
 ocEl('ocRegFields').style.display=mode==='register'?'block':'none';
 ocEl('ocForgot').style.display=mode==='login'?'inline-block':'none';
 ocEl('ocGo').textContent=mode==='login'?'Sign in':'Create account';
}

/* ---------- Register, sign in, profile ---------- */
async function ocCreateProfile(name,username,phone,email){
 const uid=ocSession.uid;
 const upd={};
 upd['usernames/'+username]=uid;
 upd['profiles/'+uid]={name:name,username:username};
 upd['private/'+uid]={email:email,phone:phone||''};
 await ocDb('PATCH','',upd);
}

async function ocSubmitAuth(){
 const email=ocEl('ocEmail').value.trim();
 const pass=ocEl('ocPass').value;
 if(!email||!pass){ocNote('Type your email and password.');return}
 const btn=ocEl('ocGo');
 btn.disabled=true;
 ocNote(ocMode==='login'?'Signing in...':'Creating your account...');
 try{
  if(ocMode==='register'){
   const name=ocEl('ocName').value.trim();
   const username=ocEl('ocUser').value.trim().toLowerCase().replace(/^@/,'');
   const phone=ocEl('ocPhone').value.trim();
   if(!name){ocNote('Type your name.');return}
   if(!/^[a-z0-9_]{3,20}$/.test(username)){
    ocNote('Username: 3 to 20 letters, numbers or underscores.');
    return;
   }
   if(pass.length<6){ocNote('Password must be at least 6 characters.');return}
   const taken=await ocPublicGet('usernames/'+username);
   if(taken){ocNote('The username @'+username+' is taken. Try another.');return}
   const data=await ocAuthCall('signUp',{email:email,password:pass,returnSecureToken:true});
   ocSetSession(data);
   ocProfile=null;
   try{
    await ocCreateProfile(name,username,phone,email);
   }catch(e){
    ocEl('ocPName').value=name;
    ocEl('ocPUser').value=username;
    ocEl('ocPPhone').value=phone;
    ocShow('profile');
    ocNote('Your account was created, but the profile could not be saved: '+ocFail(e)+' Check the username and tap Save profile.');
    return;
   }
  }else{
   const data=await ocAuthCall('signInWithPassword',{email:email,password:pass,returnSecureToken:true});
   ocSetSession(data);
  }
  ocEl('ocPass').value='';
  await ocEnterApp();
 }catch(e){
  ocNote(ocFail(e));
 }finally{
  btn.disabled=false;
 }
}

async function ocSaveProfile(){
 const name=ocEl('ocPName').value.trim();
 const username=ocEl('ocPUser').value.trim().toLowerCase().replace(/^@/,'');
 const phone=ocEl('ocPPhone').value.trim();
 if(!name){ocNote('Type your name.');return}
 if(!/^[a-z0-9_]{3,20}$/.test(username)){
  ocNote('Username: 3 to 20 letters, numbers or underscores.');
  return;
 }
 try{
  const taken=await ocPublicGet('usernames/'+username);
  if(taken){ocNote('The username @'+username+' is taken. Try another.');return}
  await ocCreateProfile(name,username,phone,ocSession.email);
  await ocEnterApp();
 }catch(e){
  ocNote(ocFail(e));
 }
}

async function ocForgot(){
 const email=ocEl('ocEmail').value.trim();
 if(!email){ocNote('Type your email above first.');return}
 try{
  await ocAuthCall('sendOobCode',{requestType:'PASSWORD_RESET',email:email});
  ocNote('If that email is registered, a reset link was sent. Check your inbox and spam.');
 }catch(e){
  ocNote('If that email is registered, a reset link was sent. Check your inbox and spam.');
 }
}

function ocSignOut(){
 ocSession=null;
 ocToken='';
 ocTokenExp=0;
 ocProfile=null;
 ocCurrent=null;
 ocChats=[];
 try{localStorage.removeItem('djflow_session')}catch(e){}
 ocAuthTab('login');
 ocShow('auth');
}

/* ---------- Entering the app ---------- */
function ocSetMe(){
 const isAdmin=ocAdmin&&ocSession.uid===ocAdmin;
 ocEl('ocMeAvatar').textContent=(ocProfile.name||'?').charAt(0).toUpperCase();
 ocEl('ocMeName').textContent=ocProfile.name+(isAdmin?' 👑 Admin':'');
 ocEl('ocMeUser').textContent='@'+ocProfile.username;
 ocEl('ocAdminBanner').style.display=ocAdmin?'none':'block';
}

async function ocEnterApp(){
 ocNote('Loading...');
 try{
  ocProfile=await ocDb('GET','profiles/'+ocSession.uid);
  if(!ocProfile){
   ocShow('profile');
   ocNote('Choose your name and username to finish.');
   return;
  }
  ocAdmin=await ocDb('GET','admin');
  ocShow('list');
  ocSetMe();
  await ocEnsureAdminDm();
  await ocLoadList();
 }catch(e){
  const msg=ocFail(e);
  if(ocView!=='list'){
   ocShow('auth');
  }
  ocNote(msg);
 }
}

async function ocClaimAdmin(){
 try{
  await ocDb('PUT','admin',ocSession.uid);
  ocAdmin=ocSession.uid;
  ocSetMe();
  ocRenderList();
  ocNote('You are now the admin 👑 (DJ DO).');
 }catch(e){
  ocNote(ocFail(e));
 }
}

/* ---------- Chat list ---------- */
async function ocCreateDm(otherUid,otherName,otherUsername){
 const me=ocSession.uid;
 const id=ocDmId(me,otherUid);
 const members={};
 members[me]=true;
 members[otherUid]=true;
 try{
  await ocDb('PUT','chats/'+id+'/meta',{type:'dm',members:members});
 }catch(e){}
 const upd={};
 upd['userChats/'+me+'/'+id]={
  type:'dm',uid:otherUid,name:otherName,username:otherUsername,
  ts:{'.sv':'timestamp'}
 };
 upd['userChats/'+otherUid+'/'+id]={
  type:'dm',uid:me,name:ocProfile.name,username:ocProfile.username,
  ts:{'.sv':'timestamp'}
 };
 await ocDb('PATCH','',upd);
 return id;
}

async function ocEnsureAdminDm(){
 if(!ocAdmin||ocAdmin===ocSession.uid)return;
 const id=ocDmId(ocSession.uid,ocAdmin);
 const mine=await ocDb('GET','userChats/'+ocSession.uid+'/'+id);
 if(mine)return;
 const p=await ocDb('GET','profiles/'+ocAdmin);
 if(!p)return;
 await ocCreateDm(ocAdmin,p.name,p.username);
}

async function ocLoadList(){
 try{
  const data=(await ocDb('GET','userChats/'+ocSession.uid))||{};
  ocChats=Object.keys(data).map(id=>Object.assign({id:id},data[id]));
  ocRenderList();
 }catch(e){
  ocNote(ocFail(e));
 }
}

function ocRenderList(){
 const box=ocEl('ocChatList');
 if(!box)return;
 box.innerHTML='';
 const rows=[];
 rows.push({kind:'community',title:'DJ Flow Community',sub:'Everyone on DJ Flow Pro (group)',ts:0,pin:1});
 ocChats.forEach(c=>{
  const isAdmin=c.uid===ocAdmin;
  rows.push({
   kind:'dm',id:c.id,otherUid:c.uid,title:c.name||'DJ',username:c.username,
   sub:c.last||'Say hello 👋',ts:c.ts||0,isAdmin:isAdmin,pin:isAdmin?0:2
  });
 });
 rows.sort((a,b)=>a.pin-b.pin||(b.ts||0)-(a.ts||0));
 rows.forEach(r=>{
  const row=document.createElement('div');
  row.className='chatitem';
  const av=document.createElement('div');
  av.className='avatar'+(r.kind==='community'?' group':'');
  av.textContent=r.kind==='community'?'👥':(r.title||'?').charAt(0).toUpperCase();
  const info=document.createElement('div');
  info.className='chatinfo';
  const nm=document.createElement('strong');
  nm.textContent=r.title+(r.isAdmin?' 👑 Admin':'');
  const sm=document.createElement('small');
  sm.textContent=r.sub;
  info.append(nm,sm);
  const tm=document.createElement('span');
  tm.className='chattime';
  tm.textContent=r.ts?chatTime(r.ts):'';
  row.append(av,info,tm);
  row.onclick=()=>ocOpenRow(r);
  box.append(row);
 });
}

function ocOpenRow(r){
 if(r.kind==='community'){
  ocOpenChat({kind:'community',path:'community/messages',title:'DJ Flow Community',sub:'Everyone on DJ Flow Pro'});
 }else{
  ocOpenChat({
   kind:'dm',id:r.id,otherUid:r.otherUid,path:'chats/'+r.id+'/messages',
   title:r.title+(r.isAdmin?' 👑 Admin':''),sub:r.username?'@'+r.username:''
  });
 }
}

async function ocFindUser(){
 const raw=ocEl('ocFind').value.trim().toLowerCase().replace(/^@/,'');
 if(!/^[a-z0-9_]{3,20}$/.test(raw)){
  ocNote('Type a username (3 to 20 letters, numbers or underscores).');
  return;
 }
 ocNote('Searching...');
 try{
  const uid=await ocDb('GET','usernames/'+raw);
  if(!uid){ocNote('No one has the username @'+raw+'.');return}
  if(uid===ocSession.uid){ocNote('That is you!');return}
  const p=await ocDb('GET','profiles/'+uid);
  if(!p){ocNote('That person has not finished setting up.');return}
  const id=ocDmId(ocSession.uid,uid);
  const mine=await ocDb('GET','userChats/'+ocSession.uid+'/'+id);
  if(!mine)await ocCreateDm(uid,p.name,p.username);
  ocEl('ocFind').value='';
  ocOpenChat({
   kind:'dm',id:id,otherUid:uid,path:'chats/'+id+'/messages',
   title:p.name+(uid===ocAdmin?' 👑 Admin':''),sub:'@'+p.username
  });
 }catch(e){
  ocNote(ocFail(e));
 }
}

/* ---------- Conversation ---------- */
function ocOpenChat(chat){
 ocCurrent=chat;
 ocMsgs=[];
 ocShown=new Set();
 ocLastTs=0;
 ocPollCount=0;
 ocEl('ocChatTitle').textContent=chat.title;
 ocEl('ocChatSub').textContent=chat.sub||'';
 const av=ocEl('ocChatAvatar');
 av.className='avatar'+(chat.kind==='community'?' group':'');
 av.textContent=chat.kind==='community'?'👥':(chat.title||'?').charAt(0).toUpperCase();
 ocEl('ocMsgs').innerHTML='';
 ocShow('chat');
 ocLoadMessages(true);
}

function ocCloseChat(){
 ocCurrent=null;
 ocShow('list');
 ocLoadList();
}

async function ocLoadMessages(full){
 const chat=ocCurrent;
 if(!chat)return;
 try{
  const enc=encodeURIComponent;
  const q=full
   ?'orderBy='+enc('"ts"')+'&limitToLast=50'
   :'orderBy='+enc('"ts"')+'&startAt='+(ocLastTs+1);
  const data=await ocDb('GET',chat.path,undefined,q);
  if(ocCurrent!==chat)return;
  const items=data?Object.keys(data)
   .map(k=>Object.assign({key:k},data[k]))
   .filter(m=>m&&m.text!==undefined):[];
  items.sort((a,b)=>a.ts-b.ts);
  if(full){ocMsgs=[];ocShown=new Set()}
  let added=false;
  items.forEach(m=>{
   if(!ocShown.has(m.key)){
    ocShown.add(m.key);
    ocMsgs.push(m);
    added=true;
   }
  });
  ocMsgs.forEach(m=>{if(m.ts>ocLastTs)ocLastTs=m.ts});
  if(full||added)ocRenderMsgs();
 }catch(e){
  ocNote(ocFail(e));
 }
}

function ocRenderMsgs(){
 const box=ocEl('ocMsgs');
 box.innerHTML='';
 if(!ocMsgs.length){
  const p=document.createElement('p');
  p.textContent='No messages yet. Say hello! 👋';
  box.append(p);
  return;
 }
 const me=ocSession.uid;
 ocMsgs.forEach(m=>{
  const mine=m.from===me;
  const b=document.createElement('div');
  b.className='msg '+(mine?'me':'them');
  if(!mine){
   const w=document.createElement('span');
   w.className='who';
   w.textContent=(m.from===ocAdmin?'👑 ':'')+(m.name||'DJ');
   b.append(w);
  }
  const t=document.createElement('span');
  t.textContent=m.text;
  b.append(t);
  const when=document.createElement('span');
  when.className='when';
  when.textContent=chatTime(m.ts);
  b.append(when);
  if(ocCurrent&&ocCurrent.kind==='community'&&me===ocAdmin){
   const d=document.createElement('button');
   d.textContent='🗑';
   d.style.cssText='background:none;padding:2px 6px;font-size:12px';
   d.onclick=()=>ocDeleteMsg(m.key);
   b.append(d);
  }
  box.append(b);
 });
 box.scrollTop=box.scrollHeight;
}

async function ocSend(){
 const input=ocEl('ocInput');
 const text=input.value.trim().slice(0,1000);
 if(!text||!ocCurrent||!ocProfile)return;
 input.value='';
 const chat=ocCurrent;
 try{
  await ocDb('POST',chat.path,{
   from:ocSession.uid,
   name:ocProfile.name,
   text:text,
   ts:{'.sv':'timestamp'}
  });
  if(chat.kind==='dm'){
   try{
    const me=ocSession.uid;
    const last=text.slice(0,60);
    const upd={};
    upd['userChats/'+me+'/'+chat.id+'/last']=last;
    upd['userChats/'+me+'/'+chat.id+'/ts']={'.sv':'timestamp'};
    upd['userChats/'+chat.otherUid+'/'+chat.id+'/last']=last;
    upd['userChats/'+chat.otherUid+'/'+chat.id+'/ts']={'.sv':'timestamp'};
    await ocDb('PATCH','',upd);
   }catch(e){}
  }
  await ocLoadMessages(false);
 }catch(e){
  input.value=text;
  ocNote(ocFail(e));
 }
}

async function ocDeleteMsg(key){
 if(!confirm('Delete this message for everyone?'))return;
 try{
  await ocDb('DELETE','community/messages/'+key);
  ocMsgs=ocMsgs.filter(m=>m.key!==key);
  ocRenderMsgs();
 }catch(e){
  ocNote(ocFail(e));
 }
}

/* ---------- Refresh every few seconds (only while visible) ---------- */
setInterval(()=>{
 const page=ocEl('page-online');
 if(!page||!page.classList.contains('active')||document.hidden||!ocSession)return;
 if(ocView==='chat'){
  ocPollCount++;
  ocLoadMessages(ocPollCount%8===0);
 }else if(ocView==='list'){
  ocTick++;
  if(ocTick%3===0)ocLoadList();
 }
},4000);

buildOnlinePage();