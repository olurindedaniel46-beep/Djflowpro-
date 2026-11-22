/* vinyl.js - spinning vinyl discs for Deck A and Deck B */

function buildVinyls(){
 const style=document.createElement('style');
 style.textContent=`
  .vinyl{
   position:relative;
   width:100%;max-width:120px;aspect-ratio:1/1;
   margin:12px auto;border-radius:50%;
   background:repeating-radial-gradient(circle,#090b12 0 2px,#1a2031 2px 4px);
   border:3px solid rgba(66,232,197,.6);
   box-shadow:0 0 10px rgba(66,232,197,.12);
   animation:vinylSpin 1.8s linear infinite;
   animation-play-state:paused;
   transition:box-shadow .3s ease;
  }
  .vinyl.playing{
   animation-play-state:running;
   box-shadow:0 0 22px rgba(66,232,197,.5);
  }
  .vinyl::before{
   content:'';position:absolute;top:5%;left:50%;
   width:4px;height:16%;margin-left:-2px;
   background:#42e8c5;border-radius:2px;
  }
  .vinyl .vlabel{
   position:absolute;inset:34%;border-radius:50%;
   background:#42e8c5;color:#10121b;
   display:flex;align-items:center;justify-content:center;
   font-weight:bold;font-size:14px;
  }
  @keyframes vinylSpin{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){
   .vinyl{animation:none}
  }
 `;
 document.head.append(style);

 ['A','B'].forEach(d=>{
  const audio=document.getElementById('audio'+d);
  if(!audio)return;
  const disc=document.createElement('div');
  disc.className='vinyl';
  disc.id='vinyl'+d;
  const label=document.createElement('div');
  label.className='vlabel';
  label.textContent=d;
  disc.append(label);
  audio.before(disc);

  const setSpeed=()=>{
   const rate=audio.playbackRate||1;
   disc.style.animationDuration=(1.8/rate)+'s';
  };
  audio.addEventListener('play',()=>disc.classList.add('playing'));
  ['pause','ended','emptied'].forEach(ev=>{
   audio.addEventListener(ev,()=>disc.classList.remove('playing'));
  });
  audio.addEventListener('ratechange',setSpeed);
  setSpeed();
  if(!audio.paused)disc.classList.add('playing');
 });
}

buildVinyls();