/**
 * app.js  —  Kindle-style PDF reader
 *
 * Depends on PDF.js loaded as an ES module via the <script> tag in index.html.
 * We wait for the module to expose pdfjsLib on the global scope (the CDN
 * build attaches itself to window automatically).
 */

// ─── Wait for PDF.js to be ready ──────────────────────────────────────────

async function getPdfjsLib() {
  // The CDN UMD/module build sets window.pdfjsLib once parsed.
  // Poll briefly in case the script hasn't fully executed yet.
  for (let i = 0; i < 40; i++) {
    if (window.pdfjsLib) return window.pdfjsLib;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('PDF.js failed to load. Check your internet connection.');
}

// ─── State ─────────────────────────────────────────────────────────────────

const state = {
  pdfs:        [],   // array of path strings from pdf-list.json
  currentPath: null,
  currentDoc:  null,
  currentPage: 1,
  rendering:   false,
};

// ─── DOM refs ──────────────────────────────────────────────────────────────

const libraryView  = document.getElementById('library-view');
const readerView   = document.getElementById('reader-view');
const shelf        = document.getElementById('shelf');
const emptyMsg     = document.getElementById('empty-msg');
const bookCount    = document.getElementById('book-count');
const readerTitle  = document.getElementById('reader-title');
const pageIndicator = document.getElementById('page-indicator');
const pdfCanvas    = document.getElementById('pdf-canvas');
const pageLoading  = document.getElementById('page-loading');
const backBtn      = document.getElementById('back-btn');
const prevBtn      = document.getElementById('prev-btn');
const nextBtn      = document.getElementById('next-btn');

// ─── Library ───────────────────────────────────────────────────────────────

async function loadLibrary() {
  let pdfs = [];
  try {
    const res = await fetch(`./pdf-list.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pdfs = await res.json();
    if (!Array.isArray(pdfs)) throw new Error('pdf-list.json is not an array');
  } catch (err) {
    console.error('Could not load pdf-list.json:', err);
    emptyMsg.textContent = 'Could not load pdf-list.json. ' + err.message;
    emptyMsg.hidden = false;
    return;
  }

  state.pdfs = pdfs;
  bookCount.textContent = `${pdfs.length} book${pdfs.length !== 1 ? 's' : ''}`;

  if (pdfs.length === 0) {
    emptyMsg.hidden = false;
    return;
  }

  pdfs.forEach((path, index) => {
    const card = createBookCard(path, index);
    shelf.appendChild(card);
  });
}

function createBookCard(path, index) {
  const fileName  = path.split('/').pop();
  const cleanName = fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');

  // Read stored progress for the progress bar
  const savedPage = parseInt(localStorage.getItem(`page::${path}`)) || 1;

  const card = document.createElement('div');
  card.className = 'book-card';
  card.style.animationDelay = `${index * 60}ms`;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Open ${cleanName}`);
  card.title = cleanName;

  card.innerHTML = `
    <div class="book-cover">
      <span class="book-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="book-title">${escapeHtml(cleanName)}</span>
      <div class="book-progress-bar">
        <div class="book-progress-fill" style="width: 0%" data-path="${escapeHtml(path)}"></div>
      </div>
    </div>
  `;

  // We can't know total pages without loading the doc, so just show
  // "has been opened" indicator if there's a saved page > 1.
  if (savedPage > 1) {
    card.querySelector('.book-progress-fill').style.width = '30%'; // placeholder
  }

  card.addEventListener('click', () => openBook(path, cleanName));
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBook(path, cleanName); }
  });

  return card;
}

// ─── Reader ────────────────────────────────────────────────────────────────

async function openBook(path, title) {
  setLoading(true);

  readerTitle.textContent = title;
  libraryView.hidden = true;
  readerView.hidden  = false;

  const pdfjsLib = await getPdfjsLib();
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

  try {
    state.currentPath = path;
    state.currentDoc  = await pdfjsLib.getDocument('./' + path).promise;
    state.currentPage = parseInt(localStorage.getItem(`page::${path}`)) || 1;
    // Clamp in case the stored page is out of range
    state.currentPage = Math.max(1, Math.min(state.currentPage, state.currentDoc.numPages));
  } catch (err) {
    console.error('Failed to open PDF:', err);
    alert(`Could not open "${title}".\n${err.message}`);
    closeReader();
    return;
  }

  await renderPage(state.currentPage);
}

async function renderPage(pageNum) {
  if (state.rendering) return;
  state.rendering = true;
  setLoading(true);

  try {
    const page     = await state.currentDoc.getPage(pageNum);
    const canvas   = pdfCanvas;
    const ctx      = canvas.getContext('2d');

    // Scale to fit the available canvas-wrap area
    const wrap     = document.querySelector('.canvas-wrap');
    const maxW     = wrap.clientWidth  - 8;
    const maxH     = wrap.clientHeight - 8;
    const baseVP   = page.getViewport({ scale: 1 });
    const scale    = Math.min(maxW / baseVP.width, maxH / baseVP.height, 2);
    const viewport = page.getViewport({ scale });

    canvas.width  = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    state.currentPage = pageNum;
    localStorage.setItem(`page::${state.currentPath}`, pageNum);

    updateReaderUI();
  } catch (err) {
    console.error('Render error:', err);
  } finally {
    state.rendering = false;
    setLoading(false);
  }
}

function updateReaderUI() {
  const total = state.currentDoc?.numPages ?? 0;
  pageIndicator.textContent = `${state.currentPage} / ${total}`;
  prevBtn.disabled = state.currentPage <= 1;
  nextBtn.disabled = state.currentPage >= total;
}

function closeReader() {
  readerView.hidden  = true;
  libraryView.hidden = false;
  state.currentDoc   = null;
  state.currentPath  = null;
  state.currentPage  = 1;
  pageIndicator.textContent = '— / —';
}

function setLoading(on) {
  pageLoading.classList.toggle('visible', on);
}

// ─── Event listeners ───────────────────────────────────────────────────────

backBtn.addEventListener('click', closeReader);

nextBtn.addEventListener('click', () => {
  if (state.currentPage < state.currentDoc.numPages) {
    renderPage(state.currentPage + 1);
  }
});

prevBtn.addEventListener('click', () => {
  if (state.currentPage > 1) {
    renderPage(state.currentPage - 1);
  }
});

// Keyboard navigation
document.addEventListener('keydown', e => {
  if (readerView.hidden) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  nextBtn.click();
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    prevBtn.click();
  if (e.key === 'Escape')                                closeReader();
});

// ─── Utilities ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Boot ──────────────────────────────────────────────────────────────────

loadLibrary();
