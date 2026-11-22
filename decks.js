/* decks.js - Library pickers, Play both and Auto-fade for DJ Flow Pro */

let deckPickerTarget=null;
let mixFadeTimer=null;

function buildDeckExtras(){
 const style=document.createElement('style');
 style.textContent=`
  .mixbox{margin:20px 0;background:#202438;padding:15px;border-radius:12px}
  .mixbox h3{margin:0 0 8px;color:#42e8c5}
  .mixbox select{
   font:inherit;padding:10px;border-radius:9px;
   background:#10121b;color:white;border:1px solid #414963
  }
  .mixbox label{display:block;margin:10px 0 4px;font-size:14px}
  #deckPicker{
   display:none;background:#202438;border:1px solid #42e8c5;
   border-radius:12px;padding:12px;margin:12px 0
  }
  #deckPickerList{max-height:40vh;overflow-y:auto}
  .pickrow{
   display:flex;align-items:center;justify-content:space-between;
   gap:8px;background:#10121b;padding:10px;margin:6px 0;border-radius:10px
  }
  .pickrow .info{flex:1;min-width:0;overflow-wrap:anywhere}
  .pickrow small{display:block;color:#aeb5ca;margin-top:3px}
  .deckbtn{width:100%;margin-top:8px}
 `;
 document.head.append(style);

 ['A','B'].forEach(d=>{
  const nameEl=document.getElementById('name'+d);
  const btn=document.createElement('button');
  btn.className='deckbtn';
  btn.textContent='📚 From Library';
  btn.onclick=()=>openDeckPicker(d);
  nameEl.parentElement.insertBefore(btn,nameEl);
 });

 const picker=document.createElement('div');
 picker.id='deckPicker';
 picker.innerHTML=`
  <h3 id="deckPickerTitle" style="margin:0 0 8px;color:#42e8c5">Choose a song</h3>
  <input id="deckPickerSearch" placeholder="🔍 Search..." oninput="renderDeckPicker()">
  <div id="deckPickerList"></div>
  <button onclick="closeDeckPicker()"
   style="margin-top:8px;background:#2f3a5c;color:white">Close</button>
 `;
 document.querySelector('.deck-container').after(picker);

 const mix=document.createElement('div');
 mix.className='mixbox';
 mix.innerHTML=`
  <h3>🎛️ Mix controls</h3>
  <div class="actions">
   <button onclick="mixPlayBoth()">▶ Play both</button>
   <button onclick="mixPauseBoth()">⏸ Pause both</button>
  </div>
  <label>⏱️ Auto-fade time</label>
  <select id="fadeSeconds">
   <option value="5">5 seconds</option>
   <option value="10" selected>10 seconds</option>
   <option value="15">15 seconds</option>
   <option value="20">20 seconds</option>
  </select>
  <label style="display:flex;align-items:center;gap:8px">
   <input id="fadeStopOld" type="checkbox" checked style="width:auto;margin:0">
   Stop the old deck when the fade ends
  </label>
  <div class="actions" style="margin-top:8px">
   <button onclick="mixAutoFade('B')">A ➜ B</button>
   <button onclick="mixAutoFade('A')">B ➜ A</button>
   <button onclick="mixStopFade()" style="background:#2f3a5c;color:white">✋ Stop fade</button>
  </div>
  <p id="mixStatus" style="font-size:13px;color:#aeb5ca;margin-bottom:0">
   Load a song in each deck, press play on Deck A, then tap A ➜ B.
  </p>
 `;
 document.querySelector('.crossfader').after(mix);
}

function mixSay(text){
 const el=document.getElementById('mixStatus');
 if(el)el.textContent=text;
}

/* ----- Choose a song from the Library ----- */
function openDeckPicker(deck){
 deckPickerTarget=deck;
 document.getElementById('deckPickerTitle').textContent='Choose a song for Deck '+deck;
 document.getElementById('deckPickerSearch').value='';
 const box=document.getElementById('deckPicker');
 box.style.display='block';
 renderDeckPicker();
 box.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function closeDeckPicker(){
 deckPickerTarget=null;
 document.getElementById('deckPicker').style.display='none';
}

function renderDeckPicker(){
 const list=document.getElementById('deckPickerList');
 list.innerHTML='';
 if(!library.length){
  list.innerHTML='<p>Your library is empty. Add music in the Library tab first.</p>';
  return;
 }
 const q=document.getElementById('deckPickerSearch').value.toLowerCase();
 const songs=library.filter(s=>s.name.toLowerCase().includes(q));
 if(!songs.length){
  list.innerHTML='<p>No songs match.</p>';
  return;
 }
 songs.forEach(song=>{
  const row=document.createElement('div');
  row.className='pickrow';
  const info=document.createElement('div');
  info.className='info';
  const title=document.createElement('strong');
  title.textContent=song.name;
  const sub=document.createElement('small');
  sub.textContent=(song.category==='Worldly'?'🎉 Worldly':'⛪ Christian')+
   (song.duration>0?' • '+fmt(song.duration):'');
  info.append(title,sub);
  const btn=document.createElement('button');
  btn.textContent='Load';
  btn.onclick=()=>{
   loadDeckFromSong(deckPickerTarget,song);
   closeDeckPicker();
  };
  row.append(info,btn);
  list.append(row);
 });
}

function loadDeckFromSong(deck,song){
 if(!deck)return;
 const audio=document.getElementById('audio'+deck);
 audio.src=song.url;
 document.getElementById('name'+deck).textContent=song.name;
 setDeckVolume(deck,deckVolumes[deck]);
 mixSay('Deck '+deck+' loaded: '+song.name);
}

/* ----- Play both / Pause both ----- */
function mixPlayBoth(){
 let played=0;
 ['A','B'].forEach(d=>{
  const a=document.getElementById('audio'+d);
  if(a.getAttribute('src')){
   a.play().catch(()=>{});
   played++;
  }
 });
 mixSay(played?'Playing. Use the crossfader to choose what you hear.':'Load a song into a deck first.');
}

function mixPauseBoth(){
 ['A','B'].forEach(d=>document.getElementById('audio'+d).pause());
 mixSay('Both decks paused.');
}

/* ----- Auto-fade ----- */
function mixStopFade(){
 if(mixFadeTimer){
  clearInterval(mixFadeTimer);
  mixFadeTimer=null;
  mixSay('Fade stopped.');
 }
}

function mixAutoFade(target){
 const fromDeck=target==='B'?'A':'B';
 const toAudio=document.getElementById('audio'+target);
 const fromAudio=document.getElementById('audio'+fromDeck);
 if(!toAudio.getAttribute('src')){
  mixSay('Load a song in Deck '+target+' first.');
  return;
 }
 mixStopFade();
 const slider=document.getElementById('crossfader');
 const startVal=Number(slider.value);
 const endVal=target==='B'?1:0;
 if(startVal===endVal){
  mixSay('The crossfader is already on Deck '+target+'.');
  return;
 }
 const secs=Number(document.getElementById('fadeSeconds').value)||10;
 if(toAudio.paused)toAudio.play().catch(()=>{});
 const t0=Date.now();
 mixSay('Fading to Deck '+target+'...');
 mixFadeTimer=setInterval(()=>{
  const p=Math.min(1,(Date.now()-t0)/(secs*1000));
  const v=startVal+(endVal-startVal)*p;
  slider.value=v;
  applyDeckVolumes(v);
  if(p>=1){
   clearInterval(mixFadeTimer);
   mixFadeTimer=null;
   if(document.getElementById('fadeStopOld').checked){
    fromAudio.pause();
    mixSay('Done. Deck '+target+' is playing and Deck '+fromDeck+' was stopped.');
   }else{
    mixSay('Done. Deck '+target+' is playing. Deck '+fromDeck+' is still running silently.');
   }
  }
 },50);
}

/* Moving the crossfader by hand stops an auto-fade */
function moveCrossfader(value){
 if(mixFadeTimer){
  clearInterval(mixFadeTimer);
  mixFadeTimer=null;
  mixSay('Fade stopped because you moved the crossfader.');
 }
 applyDeckVolumes(Number(value));
}

buildDeckExtras();