/* beat.js - BPM detection and beat matching for DJ Flow Pro */

const deckBpm={A:0,B:0};

function buildBeatUI(){
 const style=document.createElement('style');
 style.textContent=`
  .bpmbox{margin-top:10px}
  .bpmbox button{width:100%;margin:4px 0;padding:10px;font-size:14px}
  .bpmline{font-size:14px;margin:4px 0}
  .bpmfix{display:flex;gap:6px}
  .bpmfix button{background:#2f3a5c;color:white;font-weight:normal}
 `;
 document.head.append(style);

 ['A','B'].forEach(d=>{
  const audio=document.getElementById('audio'+d);
  const box=document.createElement('div');
  box.className='bpmbox';
  box.innerHTML=`
   <button id="bpmBtn${d}" onclick="detectBpm('${d}')">🎵 Detect BPM</button>
   <p class="bpmline" id="bpmText${d}">BPM: – • Speed: 100%</p>
   <div class="bpmfix">
    <button onclick="fixBpm('${d}',0.5)">÷2</button>
    <button onclick="fixBpm('${d}',2)">×2</button>
   </div>
  `;
  audio.after(box);
  audio.addEventListener('loadstart',()=>{
   deckBpm[d]=0;
   showBpm(d);
  });
  audio.addEventListener('ratechange',()=>showBpm(d));
 });

 const beat=document.createElement('div');
 beat.className='mixbox';
 beat.innerHTML=`
  <h3>🥁 Beat match</h3>
  <p id="beatInfo" style="font-size:13px;color:#aeb5ca;margin-top:0">
   Tap Detect BPM on both decks, then match the speeds.
  </p>
  <div class="actions">
   <button onclick="beatMatch('B')">Match B to A</button>
   <button onclick="beatMatch('A')">Match A to B</button>
   <button onclick="beatReset()">↺ Reset speeds</button>
  </div>
  <label>Nudge timing (◀ makes that deck's beat later, ▶ earlier)</label>
  <div class="actions">
   <button onclick="beatNudge('A',-0.05)">A ◀</button>
   <button onclick="beatNudge('A',0.05)">A ▶</button>
   <button onclick="beatNudge('B',-0.05)">B ◀</button>
   <button onclick="beatNudge('B',0.05)">B ▶</button>
  </div>
 `;
 const anchor=document.querySelector('.mixbox')||document.querySelector('.crossfader');
 anchor.after(beat);
}

function showBpm(d){
 const audio=document.getElementById('audio'+d);
 const text=document.getElementById('bpmText'+d);
 if(!text)return;
 text.textContent='BPM: '+(deckBpm[d]?deckBpm[d].toFixed(1):'–')+
  ' • Speed: '+Math.round(audio.playbackRate*100)+'%';
}

async function detectBpm(deck){
 const audio=document.getElementById('audio'+deck);
 const btn=document.getElementById('bpmBtn'+deck);
 const text=document.getElementById('bpmText'+deck);
 const src=audio.getAttribute('src');
 if(!src){
  text.textContent='Load a song first.';
  return;
 }
 btn.disabled=true;
 text.textContent='Listening... (can take 10 to 30 seconds)';
 try{
  deckBpm[deck]=await estimateBpm(src);
  showBpm(deck);
 }catch(e){
  text.textContent='Could not detect BPM: '+((e&&e.message)||'unknown problem');
 }
 btn.disabled=false;
}

async function estimateBpm(url){
 const Ctx=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 if(!Ctx)throw new Error('This browser cannot analyse audio.');
 const res=await fetch(url);
 const arr=await res.arrayBuffer();
 const ctx=new Ctx(1,11025,11025);
 const audioBuf=await new Promise((resolve,reject)=>{
  const p=ctx.decodeAudioData(arr,resolve,reject);
  if(p&&p.catch)p.catch(reject);
 });

 const rate=audioBuf.sampleRate;
 const ch0=audioBuf.getChannelData(0);
 const ch1=audioBuf.numberOfChannels>1?audioBuf.getChannelData(1):null;
 const total=ch0.length;
 const maxLen=Math.min(total,Math.floor(rate*90));
 const start=total>maxLen?Math.min(Math.floor(rate*20),total-maxLen):0;

 const hop=128;
 const frames=Math.floor(maxLen/hop);
 if(frames<400)throw new Error('The song is too short to analyse.');

 /* Low-pass filter (keeps the kick drum) and measure loudness per frame */
 const env=new Float32Array(frames);
 let y=0;
 const alpha=0.1;
 for(let f=0;f<frames;f++){
  let sum=0;
  for(let k=0;k<hop;k++){
   const i=start+f*hop+k;
   const x=ch1?(ch0[i]+ch1[i])*0.5:ch0[i];
   y+=alpha*(x-y);
   sum+=Math.abs(y);
  }
  env[f]=sum/hop;
 }

 /* Onsets = sudden rises in loudness */
 const onset=new Float32Array(frames);
 let mean=0;
 for(let f=1;f<frames;f++){
  onset[f]=Math.max(0,env[f]-env[f-1]);
  mean+=onset[f];
 }
 mean/=frames;
 for(let f=0;f<frames;f++)onset[f]-=mean;

 /* Find the repeat time of the onsets (autocorrelation) between 60 and 180 BPM */
 const fps=rate/hop;
 const minLag=Math.floor(fps*60/180);
 const maxLag=Math.ceil(fps*60/60);
 const ac=new Float32Array(maxLag+2);
 for(let L=minLag-1;L<=maxLag+1;L++){
  let s=0;
  for(let i=0;i+L<frames;i++)s+=onset[i]*onset[i+L];
  ac[L]=s/(frames-L);
 }

 let best=-1,bestScore=-Infinity;
 for(let L=minLag;L<=maxLag;L++){
  if(!(ac[L]>ac[L-1]&&ac[L]>=ac[L+1]))continue;
  const bpm=60*fps/L;
  const oct=Math.log2(bpm/120)/0.7;
  const score=ac[L]*(0.5+0.5*Math.exp(-0.5*oct*oct));
  if(score>bestScore){bestScore=score;best=L}
 }
 if(best<0)throw new Error('No clear beat was found.');

 const a=ac[best-1],b=ac[best],c=ac[best+1];
 const denom=a-2*b+c;
 const shift=denom!==0?0.5*(a-c)/denom:0;
 let bpm=60*fps/(best+shift);
 while(bpm<70)bpm*=2;
 while(bpm>=160)bpm/=2;
 return Math.round(bpm*10)/10;
}

function fixBpm(deck,factor){
 if(!deckBpm[deck])return;
 deckBpm[deck]=Math.round(deckBpm[deck]*factor*10)/10;
 showBpm(deck);
}

function beatMatch(target){
 const src=target==='B'?'A':'B';
 const info=document.getElementById('beatInfo');
 if(!deckBpm[src]||!deckBpm[target]){
  info.textContent='Tap Detect BPM on both decks first.';
  return;
 }
 const srcAudio=document.getElementById('audio'+src);
 const audio=document.getElementById('audio'+target);
 const srcSpeed=deckBpm[src]*srcAudio.playbackRate;
 const rate=srcSpeed/deckBpm[target];
 if(rate<0.8||rate>1.25){
  info.textContent='These songs are too far apart ('+deckBpm[target].toFixed(1)+' and '+srcSpeed.toFixed(1)+' BPM). Try ×2 or ÷2 on one deck, or pick songs with closer speeds.';
  return;
 }
 audio.playbackRate=rate;
 info.textContent='Deck '+target+' is now at '+Math.round(rate*100)+'% speed to match Deck '+src+' ('+srcSpeed.toFixed(1)+' BPM).'+
  (Math.abs(rate-1)>0.08?' Big speed changes can sound odd.':'')+
  ' Now line up the beats with the nudge buttons.';
}

function beatReset(){
 ['A','B'].forEach(d=>{
  document.getElementById('audio'+d).playbackRate=1;
 });
 document.getElementById('beatInfo').textContent='Both decks are back to normal speed.';
}

function beatNudge(deck,seconds){
 const audio=document.getElementById('audio'+deck);
 audio.currentTime=Math.max(0,audio.currentTime+seconds);
}

buildBeatUI();