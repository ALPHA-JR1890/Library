const track = document.getElementById('track');
const carousel = document.getElementById('carousel');
const gridView = document.getElementById('grid-view');
const gridInner = document.getElementById('grid-inner');

const reader = document.getElementById('reader');
const canvas = document.getElementById('pdf-canvas');
const backBtn = document.getElementById('back-btn');

const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');

let books = [];
let focused = 0;

let viewMode = localStorage.getItem('kindle::viewMode') || 'carousel';
let sortMode = localStorage.getItem('kindle::sortMode') || 'title';

/* SETTINGS */
settingsBtn.onclick = () => settingsPanel.classList.toggle('open');
document.addEventListener('click', e=>{
  if(!settingsPanel.contains(e.target) && e.target!==settingsBtn){
    settingsPanel.classList.remove('open');
  }
});

/* VIEW */
function applyView(mode){
  viewMode = mode;
  localStorage.setItem('kindle::viewMode',mode);

  if(mode==='carousel'){
    carousel.style.display='';
    gridView.classList.remove('active');
  } else {
    carousel.style.display='none';
    gridView.classList.add('active');
  }
}

/* LOAD BOOKS */
async function load(){
  const res = await fetch('pdf-list.json');
  books = await res.json();

  books.forEach((b,i)=>{
    const el=document.createElement('div');
    el.className='book';
    el.textContent=b.title || b;
    el.onclick=()=>openBook(i);
    track.appendChild(el);
  });

  update();
}

/* CAROUSEL */
function update(){
  [...document.querySelectorAll('.book')].forEach((b,i)=>{
    b.classList.toggle('active',i===focused);
  });

  const active=[...document.querySelectorAll('.book')][focused];
  if(active){
    const offset=active.offsetLeft-window.innerWidth/2;
    track.style.transform=`translateX(${-offset}px)`;
  }
}

/* OPEN */
function openBook(i){
  reader.classList.add('active');
}

/* CLOSE */
backBtn.onclick=()=>{
  reader.classList.remove('active');
};

/* NAV */
window.addEventListener('keydown',e=>{
  if(e.key==='ArrowRight'){focused++;update();}
  if(e.key==='ArrowLeft'){focused--;update();}
});

load();
