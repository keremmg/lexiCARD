// ──────────────────────────────────────────────────────────────────
// UTILITIES
// ──────────────────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uuid = () => crypto.randomUUID();

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let _toastTimer;
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-visible'));
  setTimeout(() => { el.classList.remove('toast-visible'); setTimeout(() => el.remove(), 400); }, 2800);
}

function showScreen(id) {
  $$('.screen').forEach(s => {
    s.classList.toggle('active', s.id === `screen-${id}`);
    s.classList.toggle('hidden', s.id !== `screen-${id}`);
  });
}

// Twemoji: render emoji as SVG images (works on Windows where flag emoji = letters)
function parseTwemoji(root = document.body) {
  if (typeof twemoji !== 'undefined') {
    twemoji.parse(root, {
      folder: 'svg', ext: '.svg',
      base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/'
    });
  }
}

function updateNavbar(ctx) {
  const nav = $('#navbar-actions');
  if (ctx === 'home') nav.innerHTML = '';
  else if (ctx === 'lang') nav.innerHTML = '<span class="navbar-ctx">Language Decks</span>';
  else if (ctx === 'deck') nav.innerHTML = '<span class="navbar-ctx">Deck View</span>';
  else if (ctx === 'study') nav.innerHTML = '<span class="navbar-ctx">Deck View</span>';
}

// ──────────────────────────────────────────────────────────────────
// STORAGE  (v2 — { version, languages, decks })
// ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'lexicard_data';
const STORAGE_KEY_OLD = 'lexicard_decks'; // legacy

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
      // Migrate legacy data
      const old = localStorage.getItem(STORAGE_KEY_OLD);
      if (old) {
        const oldDecks = JSON.parse(old);
        const langId = 'lang-en';
        const migrated = {
          version: 2,
          languages: [{ id: langId, name: 'English', flag: '🇬🇧' }],
          decks: oldDecks.map(d => ({ ...d, languageId: langId }))
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (_) { }
    return { version: 2, languages: [], decks: [] };
  },
  save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, ...data }));
  }
};

// ──────────────────────────────────────────────────────────────────
// APP STATE
// ──────────────────────────────────────────────────────────────────
const State = {
  languages: [],
  decks: [],
  currentLanguageId: null,
  currentDeckId: null,
  editingCardId: null,
  editingDeckId: null,
  studyDeckId: null,
  studyIndex: 0,
  studyFlipped: false,

  get currentLanguage() { return this.languages.find(l => l.id === this.currentLanguageId); },
  get currentDeck() { return this.decks.find(d => d.id === this.currentDeckId); },
  get studyDeck() { return this.decks.find(d => d.id === this.studyDeckId); },
  get langDecks() { return this.decks.filter(d => d.languageId === this.currentLanguageId); }
};

function saveState() {
  Storage.save({ languages: State.languages, decks: State.decks });
}

// ──────────────────────────────────────────────────────────────────
// PHONETIC HELPERS
// ──────────────────────────────────────────────────────────────────

/**
 * Returns { d1, d2, altLabel, d1Class, d2Class } dialect labels
 * based on the language name.
 * d1 = primary dialect (field phoneticUS), d2 = secondary (phoneticGB).
 */
function getDialectLabels(langName = '') {
  const n = langName.toLowerCase();
  if (n.includes('spanish') || n.includes('español')) {
    return { d1: 'ES', d2: 'LATAM', altLabel: 'LATAM sp.', d1Class: 'es-label', d2Class: 'latam-label' };
  }
  if (n.includes('french') || n.includes('français')) {
    return { d1: 'FR', d2: 'QC', altLabel: 'QC sp.', d1Class: 'fr-label', d2Class: 'qc-label' };
  }
  if (n.includes('portuguese') || n.includes('português')) {
    return { d1: 'PT', d2: 'BR', altLabel: 'BR sp.', d1Class: 'pt-label', d2Class: 'br-label' };
  }
  if (n.includes('arabic') || n.includes('عربي')) {
    return { d1: 'MSA', d2: 'EGY', altLabel: 'EGY sp.', d1Class: 'msa-label', d2Class: 'egy-label' };
  }
  if (n.includes('german') || n.includes('deutsch')) {
    return { d1: 'DE', d2: 'AT', altLabel: 'AT sp.', d1Class: 'de-label', d2Class: 'at-label' };
  }
  if (n.includes('chinese') || n.includes('中文')) {
    return { d1: 'MAN', d2: 'CAN', altLabel: 'CAN sp.', d1Class: 'man-label', d2Class: 'can-label' };
  }
  // Default: English (US / UK)
  return { d1: 'US', d2: 'UK', altLabel: 'UK sp.', d1Class: 'us-label', d2Class: 'gb-label' };
}

/** Get labels for the current state's language (used in deck/study views). */
function currentDialectLabels() {
  const lang = State.currentLanguage || State.studyDeck && State.languages.find(l => l.id === State.studyDeck.languageId);
  return getDialectLabels(lang?.name || '');
}

function dialectLabelsForDeck(deckId) {
  const deck = State.decks.find(d => d.id === deckId);
  const lang = deck ? State.languages.find(l => l.id === deck.languageId) : null;
  return getDialectLabels(lang?.name || '');
}

function renderPhoneticHTML(card, labels) {
  if (!labels) labels = currentDialectLabels();
  const us = card.phoneticUS || card.phonetic || '';
  const gb = card.phoneticGB || '';
  const alt = card.altSpelling || '';

  if (!us && !gb && !alt) return '';

  // Identical → "Both"
  if (us && gb && us === gb) {
    return `<div class="vocab-dialects">
      <span class="vocab-dialect-item vocab-dialect-both"><span class="vocab-phonetic-label both-label">Both</span> <span class="vocab-phonetic-text">${escHtml(us)}</span></span>
      ${alt ? `<span class="vocab-dialect-alt"><span class="vocab-phonetic-label">${escHtml(labels.altLabel)}</span> <em>${escHtml(alt)}</em></span>` : ''}
    </div>`;
  }

  const parts = [];
  if (us) parts.push(`<span class="vocab-dialect-item"><span class="vocab-phonetic-label ${labels.d1Class}">${escHtml(labels.d1)}</span> <span class="vocab-phonetic-text">${escHtml(us)}</span></span>`);
  if (gb) parts.push(`<span class="vocab-dialect-item"><span class="vocab-phonetic-label ${labels.d2Class}">${escHtml(labels.d2)}</span> <span class="vocab-phonetic-text">${escHtml(gb)}</span></span>`);
  if (alt) parts.push(`<span class="vocab-dialect-alt"><span class="vocab-phonetic-label">${escHtml(labels.altLabel)}</span> <em>${escHtml(alt)}</em></span>`);
  return `<div class="vocab-dialects">${parts.join('')}</div>`;
}

function renderStudyPhonetic(card, el, labels) {
  if (!labels) {
    // Determine labels from the study/swipe deck
    const deckId = State.studyDeckId || (typeof SwipeState !== 'undefined' ? SwipeState.deckId : null);
    labels = deckId ? dialectLabelsForDeck(deckId) : currentDialectLabels();
  }
  const us = card.phoneticUS || card.phonetic || '';
  const gb = card.phoneticGB || '';
  if (!us && !gb) { el.textContent = ''; el.style.display = 'none'; return; }

  if (us && gb && us === gb) {
    el.textContent = `Both: ${us}`;
    el.classList.remove('fc-phonetic-dual');
    el.style.display = 'block';
  } else if (us && gb) {
    el.innerHTML = `<span class="fc-phonetic-item"><span class="fc-phonetic-dialect-tag">${escHtml(labels.d1)}</span> ${escHtml(us)}</span><span class="fc-phonetic-item"><span class="fc-phonetic-dialect-tag">${escHtml(labels.d2)}</span> ${escHtml(gb)}</span>`;
    el.classList.add('fc-phonetic-dual');
    el.style.display = 'flex';
  } else if (us) {
    el.textContent = `${labels.d1}: ${us}`;
    el.classList.remove('fc-phonetic-dual'); el.style.display = 'block';
  } else {
    el.textContent = `${labels.d2}: ${gb}`;
    el.classList.remove('fc-phonetic-dual'); el.style.display = 'block';
  }
}

// ──────────────────────────────────────────────────────────────────
// LANGUAGE HOME SCREEN
// ──────────────────────────────────────────────────────────────────
function renderLanguageHome() {
  showScreen('home');
  updateNavbar('home');

  const grid = $('#lang-grid');
  grid.innerHTML = '';

  State.languages.forEach(lang => {
    const deckCount = State.decks.filter(d => d.languageId === lang.id).length;
    const card = document.createElement('div');
    card.className = 'lang-card';
    card.dataset.id = lang.id;
    card.innerHTML = `
      <button class="lang-card-delete" data-id="${lang.id}" title="Delete language" aria-label="Delete ${escHtml(lang.name)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div class="lang-card-flag">${escHtml(lang.flag)}</div>
      <div class="lang-card-name">${escHtml(lang.name)}</div>
      <div class="lang-card-count">${deckCount} deck${deckCount !== 1 ? 's' : ''}</div>
    `;
    card.addEventListener('click', e => {
      if (e.target.closest('.lang-card-delete')) return;
      openLanguageView(lang.id);
    });
    card.querySelector('.lang-card-delete').addEventListener('click', e => {
      e.stopPropagation();
      confirmDeleteLanguage(lang.id);
    });
    grid.appendChild(card);
  });

  // Add Language tile
  const addTile = document.createElement('div');
  addTile.className = 'lang-card lang-card-add';
  addTile.innerHTML = `
    <div class="lang-card-plus">+</div>
    <div class="lang-card-name">Add Language</div>
  `;
  addTile.addEventListener('click', openAddLanguageModal);
  grid.appendChild(addTile);

  // Render emoji as images after DOM is built
  parseTwemoji($('#screen-home'));
}

function openLanguageView(langId) {
  State.currentLanguageId = langId;
  const lang = State.currentLanguage;
  if (!lang) return;

  showScreen('lang-decks');
  updateNavbar('lang');

  $('#lang-decks-flag').textContent = lang.flag;
  $('#lang-decks-title').textContent = lang.name;

  renderLangDecks();
  parseTwemoji($('#lang-decks-flag'));
}

function renderLangDecks() {
  const decks = State.langDecks;
  const grid = $('#deck-grid');
  const empty = $('#home-empty');

  grid.innerHTML = '';

  if (decks.length === 0) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    decks.forEach(deck => {
      const pct = deck.cards.length === 0 ? 0
        : Math.round((deck.studiedCount || 0) / deck.cards.length * 100);

      const el = document.createElement('div');
      el.className = 'deck-card';
      el.innerHTML = `
        <div class="deck-card-header">
          <h3 class="deck-card-name">${escHtml(deck.name)}</h3>
          <div class="deck-card-actions">
            <button class="btn btn-ghost btn-icon-only" data-action="rename" data-id="${deck.id}" title="Rename">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn btn-ghost btn-icon-only btn-danger-hover" data-action="delete" data-id="${deck.id}" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
        <div class="deck-card-meta">
          <span>${deck.cards.length} card${deck.cards.length !== 1 ? 's' : ''}</span>
          ${deck.cards.length > 0 ? `<span class="deck-progress-text">${pct}% studied</span>` : ''}
        </div>
        ${deck.cards.length > 0 ? `<div class="deck-progress-bar"><div class="deck-progress-fill" style="width:${pct}%"></div></div>` : ''}
      `;
      el.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (btn?.dataset.action === 'rename') { openRenameDeckModal(btn.dataset.id); return; }
        if (btn?.dataset.action === 'delete') { confirmDeleteDeck(btn.dataset.id); return; }
        openDeck(deck.id);
      });
      grid.appendChild(el);
    });
  }
}

function openDeck(deckId) {
  State.currentDeckId = deckId;
  renderDeckView();
}

// ──────────────────────────────────────────────────────────────────
// DECK VIEW
// ──────────────────────────────────────────────────────────────────
function renderDeckView(filter = '') {
  const deck = State.currentDeck;
  if (!deck) return;

  showScreen('deck');
  updateNavbar('deck');

  $('#deck-view-title').textContent = deck.name;
  $('#deck-card-count').textContent = `${deck.cards.length} card${deck.cards.length !== 1 ? 's' : ''}`;
  $('#btn-study-deck').disabled = deck.cards.length === 0;
  $('#btn-quiz-deck').disabled = deck.cards.length === 0;

  // Language badge — show name only (flag emoji renders as country-code text on Windows)
  const lang = State.languages.find(l => l.id === deck.languageId);
  const badge = $('#deck-lang-badge');
  if (lang) {
    badge.textContent = lang.name;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }

  // Back button label
  $('#btn-back-home-label').textContent = lang ? lang.name : 'Back';

  const q = filter.toLowerCase();
  const cards = filter
    ? deck.cards.filter(c => c.word.toLowerCase().includes(q) || c.translation.toLowerCase().includes(q))
    : deck.cards;

  const list = $('#card-list');
  const empty = $('#deck-empty');
  list.innerHTML = '';

  if (cards.length === 0) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    cards.forEach(card => {
      const el = document.createElement('div');
      el.className = 'vocab-card';
      el.innerHTML = `
        <div class="vocab-card-body">
          <div class="vocab-card-main">
            <div class="vocab-word-row">
              ${card.partOfSpeech ? card.partOfSpeech.split(',').map(pos => `<span class="vocab-pos-badge pos-${escHtml(pos.trim().toLowerCase())}">${escHtml(pos.trim())}</span>`).join(' ') : ''}
              <h3 class="vocab-word">${escHtml(card.word)}</h3>
            </div>
            ${renderPhoneticHTML(card)}
            <div class="vocab-translation-row">
              <span class="vocab-tr-arrow">→</span>
              <span class="vocab-translation">${escHtml(card.translation)}</span>
            </div>
          </div>
          <div class="vocab-card-actions">
            <button class="btn btn-ghost btn-icon-only" data-action="edit" data-id="${card.id}" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn btn-ghost btn-icon-only btn-danger-hover" data-action="delete" data-id="${card.id}" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
        ${card.sentences.length > 0 ? `
        <div class="vocab-sentences">
          ${card.sentences.map((s, i) => `
            <div class="vocab-sentence">
              <div class="vocab-sentence-en">${i + 1}. ${escHtml(s.en)}</div>
              <div class="vocab-sentence-tr">TR ${escHtml(s.tr)}</div>
            </div>`).join('')}
        </div>` : ''}
      `;
      el.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (btn?.dataset.action === 'edit') { openCardEditor(btn.dataset.id); return; }
        if (btn?.dataset.action === 'delete') { confirmDeleteCard(btn.dataset.id); return; }
      });
      list.appendChild(el);
    });
  }
  parseTwemoji($('#deck-lang-badge'));
}

// ──────────────────────────────────────────────────────────────────
// SENTENCE STEPPER
// ──────────────────────────────────────────────────────────────────
const MAX_SENTENCES = 10;

function createSentencePair(index, existing = {}, currentLang = null) {
  const div = document.createElement('div');
  div.className = 'sentence-pair';

  const flag = currentLang ? currentLang.flag : '🇬🇧';
  const name = currentLang ? currentLang.name : 'English';

  div.innerHTML = `
    <div class="sentence-pair-header">
      <span class="sentence-pair-num">${index + 1}</span>
      <span class="sentence-pair-flags">${flag} &amp; 🇹🇷</span>
    </div>
    <div class="sentence-pair-fields">
      <div class="form-group">
        <label class="form-label"><span class="flag-label">${flag}</span> ${name} Sentence</label>
        <textarea class="form-input form-textarea sentence-en" placeholder="Write the ${name} sentence…" rows="2">${escHtml(existing.en || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label"><span class="flag-label">🇹🇷</span> Turkish Sentence</label>
        <textarea class="form-input form-textarea sentence-tr" placeholder="Türkçe çevirisi…" rows="2">${escHtml(existing.tr || '')}</textarea>
      </div>
    </div>
  `;
  return div;
}

function setSentenceCount(n) {
  n = Math.max(0, Math.min(MAX_SENTENCES, n));
  const container = $('#sentence-pairs-container');
  const current = container.querySelectorAll('.sentence-pair').length;

  if (n > current) {
    for (let i = current; i < n; i++) {
      const pair = createSentencePair(i, {}, State.currentLanguage);
      container.appendChild(pair);
      requestAnimationFrame(() => requestAnimationFrame(() => pair.classList.add('open')));
    }
  } else if (n < current) {
    const pairs = [...container.querySelectorAll('.sentence-pair')];
    for (let i = current - 1; i >= n; i--) {
      const pair = pairs[i];
      pair.classList.remove('open');
      pair.addEventListener('transitionend', () => pair.remove(), { once: true });
      setTimeout(() => { if (pair.parentNode) pair.remove(); }, 400);
    }
  }

  const label = $('#sentence-counter-label');
  if (label) label.textContent = n === 0 ? 'No sentences added' : `${n} sentence${n !== 1 ? 's' : ''}`;
  const display = $('#sentence-count-display');
  if (display) display.textContent = n;
  const decBtn = $('#btn-dec-sentences');
  const incBtn = $('#btn-inc-sentences');
  if (decBtn) decBtn.disabled = n === 0;
  if (incBtn) incBtn.disabled = n === MAX_SENTENCES;
}

// ──────────────────────────────────────────────────────────────────
// CARD EDITOR MODAL
// ──────────────────────────────────────────────────────────────────
function openCardEditor(cardId = null) {
  State.editingCardId = cardId;
  const modal = $('#modal-card-editor');
  const title = $('#modal-title');
  const form = $('#card-form');

  form.reset();
  $$('.form-input', form).forEach(el => el.classList.remove('error'));
  $('#sentence-pairs-container').innerHTML = '';

  // Update phonetic field labels based on current language
  const lbl = currentDialectLabels();
  const usLabelEl = $('#label-phonetic-d1');
  const gbLabelEl = $('#label-phonetic-d2');
  const altLabelEl = $('#label-phonetic-alt');
  if (usLabelEl) usLabelEl.textContent = `${lbl.d1} Phonetic`;
  if (gbLabelEl) gbLabelEl.textContent = `${lbl.d2} Phonetic`;
  if (altLabelEl) altLabelEl.textContent = `Alt Spelling (${lbl.altLabel.replace(' sp.', '')})`;

  if (cardId) {
    const card = State.currentDeck?.cards.find(c => c.id === cardId);
    if (!card) return;
    title.textContent = 'Edit Card';
    $('#input-word').value = card.word;
    $('#input-translation').value = card.translation;
    $('#input-pos').value = card.partOfSpeech || 'noun';
    $('#input-phonetic-us').value = card.phoneticUS || card.phonetic || '';
    $('#input-phonetic-gb').value = card.phoneticGB || '';
    $('#input-alt-spelling').value = card.altSpelling || '';

    const sents = card.sentences || [];
    sents.forEach((s, i) => {
      const pair = createSentencePair(i, s, State.currentLanguage);
      $('#sentence-pairs-container').appendChild(pair);
      setTimeout(() => pair.classList.add('open'), i * 60 + 80);
    });
    const display = $('#sentence-count-display');
    if (display) display.textContent = sents.length;
    const counterLbl = $('#sentence-counter-label');
    if (counterLbl) counterLbl.textContent = sents.length === 0 ? 'No sentences added' : `${sents.length} sentence${sents.length !== 1 ? 's' : ''}`;
    const decBtn = $('#btn-dec-sentences');
    const incBtn = $('#btn-inc-sentences');
    if (decBtn) decBtn.disabled = sents.length === 0;
    if (incBtn) incBtn.disabled = sents.length === MAX_SENTENCES;
  } else {
    title.textContent = 'Add New Card';
    $('#input-pos').value = 'noun';
    $('#input-phonetic-us').value = '';
    $('#input-phonetic-gb').value = '';
    $('#input-alt-spelling').value = '';
    const display = $('#sentence-count-display');
    if (display) display.textContent = 0;
    const counterLbl = $('#sentence-counter-label');
    if (counterLbl) counterLbl.textContent = 'No sentences added';
    const decBtn = $('#btn-dec-sentences');
    const incBtn = $('#btn-inc-sentences');
    if (decBtn) decBtn.disabled = true;
    if (incBtn) incBtn.disabled = false;
  }

  modal.classList.remove('hidden');
  setTimeout(() => $('#input-word').focus(), 100);
}

function closeCardEditor() {
  $('#modal-card-editor').classList.add('hidden');
  const container = $('#sentence-pairs-container');
  if (container) container.innerHTML = '';
  State.editingCardId = null;
}

function saveCard(e) {
  e.preventDefault();
  const wordEl = $('#input-word');
  const transEl = $('#input-translation');

  let valid = true;
  [wordEl, transEl].forEach(f => {
    f.classList.remove('error');
    if (!f.value.trim()) { f.classList.add('error'); valid = false; }
  });
  if (!valid) { toast('Please fill in the word and translation.', 'error'); return; }

  const deck = State.currentDeck;
  if (!deck) return;

  const newWord = wordEl.value.trim();

  // Duplicate check (only for new cards, not editing)
  if (!State.editingCardId) {
    const existing = deck.cards.find(c => c.word.toLowerCase() === newWord.toLowerCase());
    if (existing) {
      const msg = `"${existing.word}" zaten bu destede var (çeviri: ${existing.translation}).\n\nYine de eklemek istiyor musun?`;
      if (!confirm(msg)) return;
    }
  }

  const pairs = $$('.sentence-pair', $('#sentence-pairs-container'));
  const sentences = pairs
    .map(p => ({ en: p.querySelector('.sentence-en').value.trim(), tr: p.querySelector('.sentence-tr').value.trim() }))
    .filter(s => s.en || s.tr);

  const cardData = {
    word: newWord,
    translation: transEl.value.trim(),
    partOfSpeech: $('#input-pos').value || 'noun',
    phoneticUS: $('#input-phonetic-us')?.value.trim() || '',
    phoneticGB: $('#input-phonetic-gb')?.value.trim() || '',
    altSpelling: $('#input-alt-spelling')?.value.trim() || '',
    phonetic: '',
    sentences
  };

  if (State.editingCardId) {
    const idx = deck.cards.findIndex(c => c.id === State.editingCardId);
    if (idx >= 0) deck.cards[idx] = { ...deck.cards[idx], ...cardData };
    toast('Card updated!');
  } else {
    deck.cards.push({ id: uuid(), ...cardData });
    toast('Card added! 🎉');
  }

  saveState();
  closeCardEditor();
  renderDeckView($('#card-search').value);
}

// ──────────────────────────────────────────────────────────────────
// DECK MODAL (New / Rename)
// ──────────────────────────────────────────────────────────────────
function openNewDeckModal() {
  State.editingDeckId = null;
  $('#deck-modal-title').textContent = 'New Deck';
  $('#btn-save-deck').textContent = 'Create Deck';
  $('#input-deck-name').value = '';
  $('#modal-new-deck').classList.remove('hidden');
  setTimeout(() => $('#input-deck-name').focus(), 100);
}

function openRenameDeckModal(deckId) {
  State.editingDeckId = deckId;
  const deck = State.decks.find(d => d.id === deckId);
  if (!deck) return;
  $('#deck-modal-title').textContent = 'Rename Deck';
  $('#btn-save-deck').textContent = 'Save';
  $('#input-deck-name').value = deck.name;
  $('#modal-new-deck').classList.remove('hidden');
  setTimeout(() => $('#input-deck-name').focus(), 100);
}

function closeDeckModal() {
  $('#modal-new-deck').classList.add('hidden');
  State.editingDeckId = null;
}

function saveDeck(e) {
  e.preventDefault();
  const nameInput = $('#input-deck-name');
  const name = nameInput.value.trim();
  if (!name) { nameInput.classList.add('error'); return; }
  nameInput.classList.remove('error');

  if (State.editingDeckId) {
    const deck = State.decks.find(d => d.id === State.editingDeckId);
    if (deck) { deck.name = name; toast('Deck renamed!'); }
  } else {
    State.decks.push({
      id: uuid(), name,
      languageId: State.currentLanguageId,
      cards: [],
      createdAt: new Date().toISOString(),
      studiedCount: 0
    });
    toast('Deck created! 🎉');
  }

  saveState();
  closeDeckModal();
  renderLangDecks();
}

// ──────────────────────────────────────────────────────────────────
// ADD LANGUAGE MODAL
// ──────────────────────────────────────────────────────────────────
function openAddLanguageModal() {
  $('#input-lang-name').value = '';
  $('#input-lang-flag').value = '';
  $$('.lang-preset-btn').forEach(b => b.classList.remove('active'));
  $('#modal-add-language').classList.remove('hidden');
  setTimeout(() => {
    $('#input-lang-name').focus();
    parseTwemoji($('#modal-add-language'));
  }, 100);
}

function closeAddLanguageModal() {
  $('#modal-add-language').classList.add('hidden');
}

function saveLanguage(e) {
  e.preventDefault();
  const name = $('#input-lang-name').value.trim();
  const flag = $('#input-lang-flag').value.trim() || '🌐';
  if (!name) { $('#input-lang-name').classList.add('error'); return; }
  $('#input-lang-name').classList.remove('error');

  // Check for duplicate
  if (State.languages.find(l => l.name.toLowerCase() === name.toLowerCase())) {
    toast(`"${name}" is already in your collection.`, 'error'); return;
  }

  State.languages.push({ id: uuid(), name, flag });
  saveState();
  closeAddLanguageModal();
  renderLanguageHome();
  toast(`${flag} ${name} added! 🎉`);
}

// ──────────────────────────────────────────────────────────────────
// DELETE CONFIRMATIONS
// ──────────────────────────────────────────────────────────────────
let _confirmCallback = null;

function openConfirm(title, msg, onConfirm) {
  $('#confirm-title').textContent = title;
  $('#confirm-msg').textContent = msg;
  _confirmCallback = onConfirm;
  $('#modal-confirm').classList.remove('hidden');
}

function closeConfirm() {
  $('#modal-confirm').classList.add('hidden');
  _confirmCallback = null;
}

function confirmDeleteLanguage(langId) {
  const lang = State.languages.find(l => l.id === langId);
  const deckCount = State.decks.filter(d => d.languageId === langId).length;
  if (!lang) return;
  openConfirm(
    'Delete Language',
    `Delete "${lang.name}" and all its ${deckCount} deck${deckCount !== 1 ? 's' : ''}? This cannot be undone.`,
    () => {
      State.languages = State.languages.filter(l => l.id !== langId);
      State.decks = State.decks.filter(d => d.languageId !== langId);
      saveState();
      toast(`"${lang.name}" deleted.`);
      renderLanguageHome();
    }
  );
}

function confirmDeleteDeck(deckId) {
  const deck = State.decks.find(d => d.id === deckId);
  if (!deck) return;
  openConfirm(
    'Delete Deck',
    `Delete "${deck.name}" and all its ${deck.cards.length} card${deck.cards.length !== 1 ? 's' : ''}? This cannot be undone.`,
    () => {
      State.decks = State.decks.filter(d => d.id !== deckId);
      saveState();
      toast(`"${deck.name}" deleted.`);
      renderLangDecks();
    }
  );
}

function confirmDeleteCard(cardId) {
  const deck = State.currentDeck;
  const card = deck?.cards.find(c => c.id === cardId);
  if (!card) return;
  openConfirm(
    'Delete Card',
    `Delete the card for "${card.word}"? This cannot be undone.`,
    () => {
      deck.cards = deck.cards.filter(c => c.id !== cardId);
      saveState();
      toast(`"${card.word}" deleted.`);
      renderDeckView($('#card-search').value);
    }
  );
}

// ──────────────────────────────────────────────────────────────────
// STUDY MODE
// ──────────────────────────────────────────────────────────────────
function openStudyMode(deckId) {
  const deck = State.decks.find(d => d.id === deckId);
  if (!deck || deck.cards.length === 0) return;

  State.studyDeckId = deckId;
  State.studyIndex = 0;
  State.studyFlipped = false;

  showScreen('study');
  updateNavbar('study');

  $('#study-complete').classList.add('hidden');
  const arena = document.getElementById('study-arena');
  if (arena) arena.classList.remove('hidden');

  $('#study-deck-name').textContent = deck.name;

  // Update flashcard language badge
  const lang = State.languages.find(l => l.id === deck.languageId);
  const badge = $('#fc-lang-badge');
  if (badge && lang) badge.textContent = `${lang.flag} ${lang.name}`;

  renderStudyCard();
}

function renderStudyCard() {
  const deck = State.studyDeck;
  const card = deck.cards[State.studyIndex];
  const total = deck.cards.length;

  State.studyFlipped = false;
  const fc = $('#flashcard');
  fc.classList.remove('flipped');

  $('#fc-word').textContent = card.word;
  $('#fc-translation').textContent = card.translation;

  const posEl = $('#fc-pos');
  if (card.partOfSpeech) {
    posEl.innerHTML = card.partOfSpeech.split(',').map(pos =>
      `<span class="fc-pos-badge pos-${escHtml(pos.trim().toLowerCase())}">${escHtml(pos.trim())}</span>`
    ).join(' ');
    posEl.className = '';
    posEl.parentElement.classList.remove('hidden');
  } else {
    posEl.innerHTML = '';
    posEl.parentElement.classList.add('hidden');
  }

  renderStudyPhonetic(card, $('#fc-phonetic'));

  const sentEl = $('#fc-sentences');
  sentEl.innerHTML = `<div class="fc-sentence-list">
    ${(card.sentences || []).map((s, i) => `
      <div class="fc-sentence">
        <div class="fc-sentence-en">${i + 1}. ${escHtml(s.en)}</div>
        <div class="fc-sentence-tr">🇹🇷 ${escHtml(s.tr)}</div>
      </div>`).join('')}
  </div>`;

  const pct = ((State.studyIndex + 1) / total) * 100;
  $('#study-progress-bar').style.width = `${pct}%`;
  $('#study-progress-text').textContent = `${State.studyIndex + 1} / ${total}`;
  $('#btn-prev-card').disabled = State.studyIndex === 0;
  $('#btn-next-card').disabled = State.studyIndex === total - 1;
}

function flipCard() { State.studyFlipped = !State.studyFlipped; $('#flashcard').classList.toggle('flipped', State.studyFlipped); }
function nextCard() {
  const deck = State.studyDeck;
  if (State.studyIndex < deck.cards.length - 1) { State.studyIndex++; renderStudyCard(); }
  else showStudyComplete();
}
function prevCard() { if (State.studyIndex > 0) { State.studyIndex--; renderStudyCard(); } }

function showStudyComplete() {
  const arena = document.getElementById('study-arena');
  if (arena) arena.classList.add('hidden');
  $('#study-complete').classList.remove('hidden');
  const deck = State.studyDeck;
  $('#complete-msg').textContent = `You reviewed all ${deck.cards.length} cards in "${deck.name}". Great job!`;
  const d = State.decks.find(x => x.id === deck.id);
  if (d) { d.studiedCount = d.cards.length; saveState(); }
}

// ──────────────────────────────────────────────────────────────────
// SWIPE QUIZ MODE
// ──────────────────────────────────────────────────────────────────
const SwipeState = {
  deckId: null, cards: [], index: 0, results: [], revealed: false, mode: 'all',
  _dragStart: 0, _dragging: false, _dragMoved: 0
};

function saveSwipeState() {
  const deck = State.decks.find(d => d.id === SwipeState.deckId);
  if (!deck) return;
  deck.savedQuiz = {
    mode: SwipeState.mode,
    index: SwipeState.index,
    results: SwipeState.results,
    cardIds: SwipeState.cards.map(c => c.id)
  };
  saveState();
}

function promptQuizStart(deckId) {
  const deck = State.decks.find(d => d.id === deckId);
  if (!deck || deck.cards.length === 0) return;

  const modal = $('#modal-quiz-options');
  const textEl = $('#quiz-opt-text');
  const btnPrimary = $('#btn-quiz-opt-primary');
  const btnSecondary = $('#btn-quiz-opt-secondary');

  // 1. Check for RESUME
  if (deck.savedQuiz && deck.savedQuiz.index > 0 && deck.savedQuiz.index < deck.savedQuiz.cardIds.length) {
    const remaining = deck.savedQuiz.cardIds.length - deck.savedQuiz.index;
    textEl.innerHTML = `You have an incomplete quiz session.<br><strong>${remaining}</strong> cards remaining.`;
    btnPrimary.textContent = "Resume Quiz";
    btnPrimary.onclick = () => { modal.classList.add('hidden'); resumeSwipeStudy(deckId); };
    btnSecondary.textContent = "Restart Quiz";
    btnSecondary.onclick = () => { modal.classList.add('hidden'); openSwipeStudy(deckId, 'all'); };
    modal.classList.remove('hidden');
    return;
  }

  // 2. Check for INCORRECT ONLY
  const incorrectCards = deck.cards.filter(c => deck.lastIncorrectIds?.includes(c.id));
  if (incorrectCards.length > 0 && incorrectCards.length !== deck.cards.length) {
    textEl.innerHTML = `You answered <strong>${incorrectCards.length}</strong> words incorrectly in your last quiz session for this deck.`;
    btnPrimary.textContent = "Study Incorrect Only";
    btnPrimary.onclick = () => { modal.classList.add('hidden'); openSwipeStudy(deckId, 'incorrect_only'); };
    btnSecondary.textContent = "Restart All Cards";
    btnSecondary.onclick = () => { modal.classList.add('hidden'); openSwipeStudy(deckId, 'all'); };
    modal.classList.remove('hidden');
    return;
  }

  // 3. Normal start
  openSwipeStudy(deckId, 'all');
}

function resumeSwipeStudy(deckId) {
  const deck = State.decks.find(d => d.id === deckId);
  if (!deck || !deck.savedQuiz) return;

  SwipeState.deckId = deckId;
  SwipeState.mode = deck.savedQuiz.mode || 'all';
  SwipeState.cards = deck.savedQuiz.cardIds.map(id => deck.cards.find(c => c.id === id)).filter(Boolean);
  SwipeState.index = deck.savedQuiz.index;
  SwipeState.results = deck.savedQuiz.results || [];
  SwipeState.revealed = false;

  if (SwipeState.index >= SwipeState.cards.length || SwipeState.cards.length === 0) {
    showSwipeComplete();
    return;
  }

  showScreen('swipe-study');
  updateNavbar('study');
  $('#swipe-deck-name').textContent = deck.name;
  $('#swipe-complete').classList.add('hidden');
  $('#swipe-arena').classList.remove('hidden');
  $('#swipe-buttons').classList.remove('hidden');
  renderSwipeCard();
  initSwipeGestures();
}

function openSwipeStudy(deckId, mode = 'all') {
  const deck = State.decks.find(d => d.id === deckId);
  if (!deck || deck.cards.length === 0) return;
  SwipeState.deckId = deckId;
  SwipeState.mode = mode;

  if (mode === 'incorrect_only' && deck.lastIncorrectIds && deck.lastIncorrectIds.length > 0) {
    SwipeState.cards = deck.cards.filter(c => deck.lastIncorrectIds.includes(c.id));
    if (SwipeState.cards.length === 0) SwipeState.cards = [...deck.cards];
  } else {
    SwipeState.cards = [...deck.cards];
  }
  SwipeState.index = 0;
  SwipeState.results = [];
  SwipeState.revealed = false;

  deck.savedQuiz = null;
  saveState();

  showScreen('swipe-study');
  updateNavbar('study');
  $('#swipe-deck-name').textContent = deck.name;
  $('#swipe-complete').classList.add('hidden');
  $('#swipe-arena').classList.remove('hidden');
  $('#swipe-buttons').classList.remove('hidden');
  renderSwipeCard();
  initSwipeGestures();
}

function renderSwipeCard() {
  const card = SwipeState.cards[SwipeState.index];
  const total = SwipeState.cards.length;
  SwipeState.revealed = false;

  const swipeCard = $('#swipe-card');
  swipeCard.style.transition = 'transform 0.35s cubic-bezier(.23,1,.32,1)';
  swipeCard.style.transform = '';
  swipeCard.style.opacity = '1';
  $('#swipe-overlay-wrong').style.opacity = '0';
  $('#swipe-overlay-correct').style.opacity = '0';
  $('#swipe-hint-wrong').style.opacity = '0';
  $('#swipe-hint-correct').style.opacity = '0';

  $('#swipe-word').textContent = card.word;

  const posEl = $('#swipe-fc-pos');
  if (card.partOfSpeech) {
    posEl.innerHTML = card.partOfSpeech.split(',').map(pos =>
      `<span class="fc-pos-badge pos-${escHtml(pos.trim().toLowerCase())}">${escHtml(pos.trim())}</span>`
    ).join(' ');
    posEl.className = '';
    posEl.parentElement.classList.remove('hidden');
  } else {
    posEl.innerHTML = '';
    posEl.parentElement.classList.add('hidden');
  }

  renderStudyPhonetic(card, $('#swipe-phonetic'));

  $('#swipe-reveal').classList.add('hidden');
  $('#swipe-tap-hint').classList.remove('hidden');

  const pct = (SwipeState.index / total) * 100;
  $('#swipe-progress-bar').style.width = `${pct}%`;
  $('#swipe-progress-text').textContent = `${SwipeState.index + 1} / ${total}`;

  $('#btn-swipe-wrong').disabled = true;
  $('#btn-swipe-correct').disabled = true;
  $('#btn-swipe-reveal').disabled = false;

  // Re-init gestures each card to reset the 'moved' closure variable
  initSwipeGestures();
}

function revealSwipeCard() {
  SwipeState.revealed = true;
  const card = SwipeState.cards[SwipeState.index];
  $('#swipe-translation').textContent = card.translation;

  const sentEl = $('#swipe-sentences');
  if (card.sentences && card.sentences.length > 0) {
    sentEl.innerHTML = card.sentences.slice(0, 2).map((s, i) =>
      `<div class="swipe-sent"><span class="swipe-sent-en">${i + 1}. ${escHtml(s.en)}</span><span class="swipe-sent-tr">🇹🇷 ${escHtml(s.tr)}</span></div>`
    ).join('');
    sentEl.style.display = 'block';
  } else {
    sentEl.innerHTML = ''; sentEl.style.display = 'none';
  }

  $('#swipe-reveal').classList.remove('hidden');
  $('#swipe-tap-hint').classList.add('hidden');
  $('#btn-swipe-wrong').disabled = false;
  $('#btn-swipe-correct').disabled = false;
  $('#btn-swipe-reveal').disabled = true;
}

function submitSwipeResult(correct) {
  if (!SwipeState.revealed) { revealSwipeCard(); return; }
  const card = SwipeState.cards[SwipeState.index];
  SwipeState.results.push({ id: card.id, word: card.word, translation: card.translation, correct });

  const swipeCard = $('#swipe-card');
  swipeCard.style.transition = 'transform 0.4s ease, opacity 0.35s ease';
  swipeCard.style.transform = correct ? 'translateX(120%) rotate(18deg)' : 'translateX(-120%) rotate(-18deg)';
  swipeCard.style.opacity = '0';

  SwipeState.index++;
  saveSwipeState();

  setTimeout(() => {
    if (SwipeState.index >= SwipeState.cards.length) showSwipeComplete();
    else renderSwipeCard();
  }, 420);
}

function showSwipeComplete() {
  $('#swipe-arena').classList.add('hidden');
  $('#swipe-buttons').classList.add('hidden');
  $('#swipe-complete').classList.remove('hidden');

  const correct = SwipeState.results.filter(r => r.correct).length;
  const total = SwipeState.results.length;
  const pct = total > 0 ? correct / total : 0;

  const deck = State.decks.find(d => d.id === SwipeState.deckId);
  if (deck) {
    deck.savedQuiz = null;
    deck.lastIncorrectIds = SwipeState.results.filter(r => !r.correct).map(r => r.id);
    saveState();
  }

  $('#swipe-score-num').textContent = correct;
  $('#swipe-score-denom').textContent = `/${total}`;

  const circle = $('#swipe-score-circle');
  circle.className = 'swipe-score-circle ' + (pct === 1 ? 'score-perfect' : pct >= 0.7 ? 'score-good' : 'score-low');

  const emojis = { perfect: '🎉', good: '👍', low: '📚' };
  const key = pct === 1 ? 'perfect' : pct >= 0.7 ? 'good' : 'low';
  $('#swipe-complete-emoji').textContent = emojis[key];
  $('#swipe-complete-title').textContent = pct === 1 ? 'Perfect Score!' : pct >= 0.7 ? 'Great Job!' : 'Keep Practicing!';
  $('#swipe-score-label').textContent = pct === 1 ? 'You knew every word!' : `${correct} out of ${total} correct`;

  $('#swipe-results-list').innerHTML = SwipeState.results.map(r => `
    <div class="swipe-result-row ${r.correct ? 'result-correct' : 'result-wrong'}">
      <span class="result-icon">${r.correct ? '✓' : '✗'}</span>
      <span class="result-word">${escHtml(r.word)}</span>
      <span class="result-arrow">→</span>
      <span class="result-translation">${escHtml(r.translation)}</span>
    </div>`).join('');

  // If Perfect Score (100% correct), clear incorrect tracking for the deck
  if (pct === 1 && deck) {
    deck.lastIncorrectIds = [];
    saveState();
  }
}

// Store previous gesture handlers so we can remove them (prevent listener leaks)
let _swipeTouchMove = null;
let _swipeTouchEnd = null;
let _swipeMouseMove = null;
let _swipeMouseUp = null;

function cleanupSwipeGestures() {
  if (_swipeTouchMove) { document.removeEventListener('touchmove', _swipeTouchMove); _swipeTouchMove = null; }
  if (_swipeTouchEnd) { document.removeEventListener('touchend', _swipeTouchEnd); _swipeTouchEnd = null; }
  if (_swipeMouseMove) { document.removeEventListener('mousemove', _swipeMouseMove); _swipeMouseMove = null; }
  if (_swipeMouseUp) { document.removeEventListener('mouseup', _swipeMouseUp); _swipeMouseUp = null; }
}

function initSwipeGestures() {
  // Remove old document-level listeners first to prevent accumulation
  cleanupSwipeGestures();

  const card = $('#swipe-card');
  const old = card.cloneNode(true);
  card.parentNode.replaceChild(old, card);
  const c = $('#swipe-card');

  let startX = 0, isDragging = false, moved = 0;

  function onPointerStart(clientX) {
    if (!SwipeState.revealed) return;
    isDragging = true; startX = clientX; moved = 0;
    c.style.transition = 'none';
  }
  function onPointerMove(clientX) {
    if (!isDragging) return;
    moved = clientX - startX;
    const rot = moved * 0.09;
    c.style.transform = `translateX(${moved}px) rotate(${rot}deg)`;
    const strength = Math.min(Math.abs(moved) / 100, 1);
    if (moved > 0) {
      $('#swipe-overlay-correct').style.opacity = strength * 0.7;
      $('#swipe-overlay-wrong').style.opacity = '0';
      $('#swipe-hint-correct').style.opacity = strength;
      $('#swipe-hint-wrong').style.opacity = '0';
    } else {
      $('#swipe-overlay-wrong').style.opacity = strength * 0.7;
      $('#swipe-overlay-correct').style.opacity = '0';
      $('#swipe-hint-wrong').style.opacity = strength;
      $('#swipe-hint-correct').style.opacity = '0';
    }
  }
  function onPointerEnd() {
    if (!isDragging) return;
    isDragging = false;
    if (Math.abs(moved) > 90) {
      submitSwipeResult(moved > 0);
    } else {
      c.style.transition = 'transform 0.35s cubic-bezier(.23,1,.32,1)';
      c.style.transform = '';
      $('#swipe-overlay-correct').style.opacity = '0';
      $('#swipe-overlay-wrong').style.opacity = '0';
      $('#swipe-hint-correct').style.opacity = '0';
      $('#swipe-hint-wrong').style.opacity = '0';
    }
    moved = 0; // reset so next card click registers correctly
  }

  c.addEventListener('touchstart', e => onPointerStart(e.touches[0].clientX), { passive: true });

  // Store references for proper cleanup
  _swipeTouchMove = e => { if (isDragging) { e.preventDefault(); onPointerMove(e.touches[0].clientX); } };
  _swipeTouchEnd = () => onPointerEnd();
  _swipeMouseMove = e => onPointerMove(e.clientX);
  _swipeMouseUp = () => onPointerEnd();

  document.addEventListener('touchmove', _swipeTouchMove, { passive: false });
  document.addEventListener('touchend', _swipeTouchEnd);
  c.addEventListener('mousedown', e => { onPointerStart(e.clientX); e.preventDefault(); });
  document.addEventListener('mousemove', _swipeMouseMove);
  document.addEventListener('mouseup', _swipeMouseUp);
  c.addEventListener('click', () => { if (Math.abs(moved) < 5 && !SwipeState.revealed) revealSwipeCard(); });
}

// ──────────────────────────────────────────────────────────────────
// SEED DATA
// ──────────────────────────────────────────────────────────────────
function seedDemoData() {
  const existing = Storage.load();
  if (existing.languages && existing.languages.length > 0) return;

  const langEnId = uuid();
  const langEsId = uuid();
  const langItId = uuid();
  const langFrId = uuid();

  // Build Oxford 3000 CEFR decks from data file
  const cefrDecks = [];
  const levelNames = {
    A1: 'Oxford 3000 · A1 (Beginner)',
    A2: 'Oxford 3000 · A2 (Elementary)',
    B1: 'Oxford 3000 · B1 (Intermediate)',
    B2: 'Oxford 3000 · B2 (Upper-Intermediate)'
  };

  if (typeof OXFORD_3000 !== 'undefined') {
    ['A1', 'A2', 'B1', 'B2'].forEach(level => {
      const words = OXFORD_3000[level];
      if (!words || words.length === 0) return;

      cefrDecks.push({
        id: uuid(),
        languageId: langEnId,
        name: levelNames[level],
        createdAt: new Date().toISOString(),
        studiedCount: 0,
        cards: words.map(w => ({
          id: uuid(),
          word: w.w,
          translation: '',
          partOfSpeech: w.p || 'noun',
          phoneticUS: '',
          phoneticGB: '',
          altSpelling: '',
          phonetic: '',
          sentences: []
        }))
      });
    });
  }

  if (typeof OXFORD_C1 !== 'undefined' && OXFORD_C1.length > 0) {
    cefrDecks.push({
      id: uuid(),
      languageId: langEnId,
      name: 'Oxford 5000 · C1 (Advanced)',
      createdAt: new Date().toISOString(),
      studiedCount: 0,
      cards: OXFORD_C1.map(w => ({
        id: uuid(),
        word: w.word,
        translation: w.translation || '',
        partOfSpeech: w.partOfSpeech || 'noun',
        phoneticUS: w.phoneticUS || '',
        phoneticGB: w.phoneticGB || '',
        altSpelling: '',
        phonetic: '',
        sentences: w.sentences || []
      }))
    });
  }

  // Helper to load other CEFR decks into cefrDecks array
  function addLanguageDecks(langId, langName, sourceObjPrefix, levels) {
    levels.forEach(level => {
      const varName = `${sourceObjPrefix}_${level}`;
      const words = window[varName];
      if (!words || words.length === 0) return;

      cefrDecks.push({
        id: uuid(),
        languageId: langId,
        name: `${langName} Vocabulary · ${level}`,
        createdAt: new Date().toISOString(),
        studiedCount: 0,
        cards: words.map(w => ({
          id: uuid(),
          word: w.word,
          translation: w.translation || '',
          partOfSpeech: w.partOfSpeech || 'noun',
          phoneticUS: w.phoneticUS || w.phonetic || '',
          phoneticGB: w.phoneticGB || '',
          altSpelling: w.altSpelling || '',
          phonetic: '',
          sentences: w.sentences || []
        }))
      });
    });
  }

  addLanguageDecks(langEsId, 'Spanish', 'SPANISH', ['A1', 'A2', 'B1', 'B2']);
  addLanguageDecks(langItId, 'Italian', 'ITALIAN', ['A1', 'A2', 'B1', 'B2']);
  addLanguageDecks(langFrId, 'French', 'FRENCH', ['A1', 'A2', 'B1', 'B2']);


  const demoData = {
    version: 2,
    languages: [
      { id: langEnId, name: 'English', flag: '🇬🇧' },
      { id: langEsId, name: 'Spanish', flag: '🇪🇸' },
      { id: langItId, name: 'Italian', flag: '🇮🇹' },
      { id: langFrId, name: 'French', flag: '🇫🇷' }
    ],
    decks: [
      // ── Oxford 3000 CEFR Decks (English) ──
      ...cefrDecks,
      // ── Spanish Demo ──
      {
        id: uuid(), languageId: langEsId, name: 'Español Básico',
        createdAt: new Date().toISOString(), studiedCount: 0,
        cards: [
          {
            id: uuid(), word: 'Perseverancia', translation: 'Azim', partOfSpeech: 'noun',
            phoneticUS: '/peɾseβeˈɾansja/', phoneticGB: '', phonetic: '',
            sentences: [
              { en: 'La perseverancia es clave para el éxito.', tr: 'Azim, başarının anahtarıdır.' }
            ]
          },
          {
            id: uuid(), word: 'Elocuente', translation: 'Belagatli', partOfSpeech: 'adjective',
            phoneticUS: '/eloˈkwente/', phoneticGB: '', phonetic: '',
            sentences: [
              { en: 'El orador elocuente cautivó al público.', tr: 'Belagatli konuşmacı seyirciyi büyüledi.' }
            ]
          },
          {
            id: uuid(), word: 'Negociar', translation: 'Müzakere etmek', partOfSpeech: 'verb',
            phoneticUS: '/neɣoˈsjar/', phoneticGB: '', phonetic: '',
            sentences: [
              { en: 'Necesitamos negociar los términos del contrato.', tr: 'Sözleşme koşullarını müzakere etmemiz gerekiyor.' }
            ]
          },
          {
            id: uuid(), word: 'Organizar', translation: 'Düzenlemek', partOfSpeech: 'verb',
            phoneticUS: '/oɾɣaniˈsar/', phoneticGB: '', phonetic: '',
            sentences: [
              { en: 'Tengo que organizar mi agenda para la próxima semana.', tr: 'Gelecek hafta için programimi düzenlemem gerekiyor.' }
            ]
          }
        ]
      }
    ]
  };

  Storage.save(demoData);
}

// ──────────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ──────────────────────────────────────────────────────────────────
function initEvents() {
  // Logo → Language Home
  $('#nav-logo').addEventListener('click', renderLanguageHome);

  // ── LANGUAGE HOME ──
  // (Add Language is handled dynamically via lang-card-add click)

  // ── LANGUAGE DECKS SCREEN ──
  $('#btn-back-languages').addEventListener('click', renderLanguageHome);
  $('#btn-new-deck').addEventListener('click', openNewDeckModal);

  // ── DECK VIEW ──
  $('#btn-back-home').addEventListener('click', () => {
    if (State.currentLanguageId) openLanguageView(State.currentLanguageId);
    else renderLanguageHome();
  });
  $('#btn-add-card').addEventListener('click', () => openCardEditor());
  $('#btn-study-deck').addEventListener('click', () => openStudyMode(State.currentDeckId));
  $('#btn-quiz-deck').addEventListener('click', () => promptQuizStart(State.currentDeckId));
  $('#card-search').addEventListener('input', e => renderDeckView(e.target.value));

  // ── CARD EDITOR MODAL ──
  $('#card-form').addEventListener('submit', saveCard);
  $('#btn-close-modal').addEventListener('click', closeCardEditor);
  $('#btn-cancel-card').addEventListener('click', closeCardEditor);

  // ── SENTENCE STEPPER ──
  $('#btn-inc-sentences').addEventListener('click', () => {
    const current = $('#sentence-pairs-container').querySelectorAll('.sentence-pair').length;
    setSentenceCount(current + 1);
  });
  $('#btn-dec-sentences').addEventListener('click', () => {
    const current = $('#sentence-pairs-container').querySelectorAll('.sentence-pair').length;
    setSentenceCount(current - 1);
  });

  // ── DECK MODAL ──
  $('#deck-form').addEventListener('submit', saveDeck);
  $('#btn-close-deck-modal').addEventListener('click', closeDeckModal);
  $('#btn-cancel-deck').addEventListener('click', closeDeckModal);

  // ── ADD LANGUAGE MODAL ──
  $('#lang-form').addEventListener('submit', saveLanguage);
  $('#btn-close-lang-modal').addEventListener('click', closeAddLanguageModal);
  $('#btn-cancel-lang').addEventListener('click', closeAddLanguageModal);

  // Preset language buttons
  $$('.lang-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.lang-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('#input-lang-name').value = btn.dataset.name;
      $('#input-lang-flag').value = btn.dataset.flag;
    });
  });

  // ── CONFIRM MODAL ──
  $('#btn-confirm-ok').addEventListener('click', () => { _confirmCallback?.(); closeConfirm(); });
  $('#btn-confirm-cancel').addEventListener('click', closeConfirm);

  // ── STUDY MODE ──
  $('#btn-back-deck').addEventListener('click', () => {
    if (State.studyDeckId) { State.currentDeckId = State.studyDeckId; renderDeckView(); }
    else renderLanguageHome();
  });
  const fcWrap = $('#flashcard-wrap');
  fcWrap.addEventListener('click', flipCard);
  $('#btn-flip-card').addEventListener('click', e => { e.stopPropagation(); flipCard(); });
  $('#btn-prev-card').addEventListener('click', e => { e.stopPropagation(); prevCard(); });
  $('#btn-next-card').addEventListener('click', e => { e.stopPropagation(); nextCard(); });

  // ── STUDY COMPLETE ──
  $('#btn-restart-study').addEventListener('click', () => {
    State.studyIndex = 0;
    State.studyFlipped = false;
    $('#study-complete').classList.add('hidden');
    const arena = document.getElementById('study-arena');
    if (arena) arena.classList.remove('hidden');
    renderStudyCard();
  });
  $('#btn-back-from-complete').addEventListener('click', () => {
    if (State.studyDeckId) { State.currentDeckId = State.studyDeckId; renderDeckView(); }
    else renderLanguageHome();
  });

  // ── SWIPE QUIZ LISTENERS ──
  $('#btn-swipe-reveal').addEventListener('click', () => revealSwipeCard());
  $('#btn-swipe-correct').addEventListener('click', () => submitSwipeResult(true));
  $('#btn-swipe-wrong').addEventListener('click', () => submitSwipeResult(false));
  $('#btn-back-swipe').addEventListener('click', () => {
    if (SwipeState.deckId) { State.currentDeckId = SwipeState.deckId; renderDeckView(); }
    else renderLanguageHome();
  });
  $('#btn-swipe-restart').addEventListener('click', () => promptQuizStart(SwipeState.deckId));
  $('#btn-swipe-back-deck').addEventListener('click', () => {
    State.currentDeckId = SwipeState.deckId;
    renderDeckView();
  });

  // ── KEYBOARD ──
  document.addEventListener('keydown', e => {
    const screen = $('.screen.active');
    if (!screen) return;
    if (screen.id === 'screen-study') {
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); flipCard(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); nextCard(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prevCard(); }
    }
    if (screen.id === 'screen-swipe-study') {
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); if (!SwipeState.revealed) revealSwipeCard(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); submitSwipeResult(true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); submitSwipeResult(false); }
    }
    if (e.key === 'Escape') {
      if (!$('#modal-card-editor').classList.contains('hidden')) closeCardEditor();
      else if (!$('#modal-new-deck').classList.contains('hidden')) closeDeckModal();
      else if (!$('#modal-add-language').classList.contains('hidden')) closeAddLanguageModal();
      else if (!$('#modal-settings').classList.contains('hidden')) closeSettings();
      else if (!$('#modal-quiz-options').classList.contains('hidden')) $('#modal-quiz-options').classList.add('hidden');
      else if (!$('#modal-confirm').classList.contains('hidden')) closeConfirm();
    }
  });

  // Click backdrop to close modals
  ['#modal-card-editor', '#modal-new-deck', '#modal-add-language', '#modal-confirm', '#modal-settings', '#modal-quiz-options'].forEach(sel => {
    $(sel).addEventListener('click', e => {
      if (e.target === $(sel)) {
        if (sel === '#modal-card-editor') closeCardEditor();
        else if (sel === '#modal-new-deck') closeDeckModal();
        else if (sel === '#modal-add-language') closeAddLanguageModal();
        else if (sel === '#modal-settings') closeSettings();
        else if (sel === '#modal-quiz-options') $('#modal-quiz-options').classList.add('hidden');
        else closeConfirm();
      }
    });
  });

  // ── QUIZ OPTIONS MODAL ──
  $('#btn-close-quiz-options').addEventListener('click', () => $('#modal-quiz-options').classList.add('hidden'));

  // ── SETTINGS MODAL ──
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-close-settings').addEventListener('click', closeSettings);
  $('#btn-save-key').addEventListener('click', saveApiKey);
  $('#btn-test-key').addEventListener('click', testApiKey);
  $('#btn-toggle-key').addEventListener('click', toggleKeyVisibility);

  // ── AI SUGGEST ──
  $('#btn-ai-suggest').addEventListener('click', handleAiSuggest);
}

// ──────────────────────────────────────────────────────────────────
// AI SERVICES (Gemini + Free Fallback)
// ──────────────────────────────────────────────────────────────────
const AiService = {
  STORAGE_KEY: 'lexicard_gemini_key',
  MODEL: 'gemini-2.5-flash',

  getApiKey() {
    return localStorage.getItem(this.STORAGE_KEY) || '';
  },

  setApiKey(key) {
    if (key) localStorage.setItem(this.STORAGE_KEY, key.trim());
    else localStorage.removeItem(this.STORAGE_KEY);
  },

  hasKey() {
    return !!this.getApiKey();
  },

  async callFreeFallback(word, languageName) {
    try {
      const n = (languageName || '').toLowerCase();
      let sl = 'en';
      // Tatoeba uses 3-letter lang codes
      let tatLang = 'eng';
      // Comprehensive language mapping for Google Translate and Tatoeba
      if (n.includes('spanish') || n.includes('español')) { sl = 'es'; tatLang = 'spa'; }
      else if (n.includes('italian') || n.includes('italiano')) { sl = 'it'; tatLang = 'ita'; }
      else if (n.includes('french') || n.includes('français')) { sl = 'fr'; tatLang = 'fra'; }
      else if (n.includes('german') || n.includes('deutsch')) { sl = 'de'; tatLang = 'deu'; }
      else if (n.includes('portuguese') || n.includes('português')) { sl = 'pt'; tatLang = 'por'; }
      else if (n.includes('turkish') || n.includes('türkçe')) { sl = 'tr'; tatLang = 'tur'; }
      else if (n.includes('korean') || n.includes('한국어')) { sl = 'ko'; tatLang = 'kor'; }
      else if (n.includes('japanese') || n.includes('日本語')) { sl = 'ja'; tatLang = 'jpn'; }
      else if (n.includes('chinese') || n.includes('中文')) { sl = 'zh-CN'; tatLang = 'cmn'; }
      else if (n.includes('russian') || n.includes('русский')) { sl = 'ru'; tatLang = 'rus'; }
      else if (n.includes('arabic') || n.includes('العربية')) { sl = 'ar'; tatLang = 'ara'; }

      const tl = 'tr';

      // 1. Translation + Phonetics + Dictionary (POS) via Google Translate
      // dt=t: translation, dt=rm: romanization/phonetics, dt=bd: dictionary definition (POS)
      const trRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&dt=rm&dt=bd&q=${encodeURIComponent(word)}`);
      if (!trRes.ok) throw new Error('Translation failed');
      const trData = await trRes.json();

      const translation = trData[0]?.[0]?.[0] || '';
      // Romanization/phonetic is often at d[0][1][3] or d[0][0][3]
      const romanization = trData[0]?.[1]?.[3] || trData[0]?.[0]?.[3] || '';

      let pos = '';
      // Try to extract POS from TR dictionary data
      if (trData[1] && trData[1][0] && trData[1][0][0]) {
        pos = trData[1][0][0].toLowerCase();
      }

      // 2. If NO POS from TR translation, fetch EN dictionary data (often much richer)
      if (!pos) {
        try {
          const enRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=en&dt=bd&q=${encodeURIComponent(word)}`);
          if (enRes.ok) {
            const enData = await enRes.json();
            if (enData[1] && enData[1][0] && enData[1][0][0]) {
              pos = enData[1][0][0].toLowerCase();
            }
          }
        } catch (e) { }
      }
      if (!pos) pos = 'noun'; // Ultimate fallback

      let d1 = '', d2 = '';
      const sentences = [];

      // Use romanization as phonetic transcription if it actually provides phonetic info
      if (romanization && romanization.replace(/[\\s·-]/g, '').toLowerCase() !== word.replace(/[\\s·-]/g, '').toLowerCase()) {
        d1 = '/' + romanization + '/';
      }

      // 3. Example sentences via Tatoeba (multilingual, confirmed CORS-safe)
      try {
        const tatRes = await fetch(
          `https://tatoeba.org/en/api_v0/search?query=${encodeURIComponent(word)}&from=${tatLang}&limit=15`
        );
        if (tatRes.ok) {
          const tatData = await tatRes.json();
          const results = tatData.results || [];
          for (const r of results) {
            if (sentences.length >= 2) break;
            const sentText = r.text;
            const allTrans = [...(r.translations?.[0] || []), ...(r.translations?.[1] || [])];
            const trTrans = allTrans.find(t => t.lang === 'tur');
            if (trTrans && trTrans.text.length > 3) {
              sentences.push({ en: sentText, tr: trTrans.text });
            }
          }
        }
      } catch (e) {
        console.warn('Tatoeba skipped', e);
      }

      // 4. If no sentences found via Tatoeba (e.g., for Korean), provide useful vocab fallbacks
      if (sentences.length < 2 && translation) {
        sentences.push({ en: `[Kelime]: ${word}`, tr: translation });
        if (sentences.length < 2) {
          // If we need a second sentence to fill the 2-sentence requirement
          sentences.push({ en: `Öğrenilen kelime: ${word}`, tr: `Anlamı: ${translation}` });
        }
      }

      return {
        translation,
        partOfSpeech: pos,
        phoneticD1: d1,
        phoneticD2: d2,
        altSpelling: '',
        sentences
      };

    } catch (err) {
      console.error('Fallback absolute failure:', err);
      throw new Error('FALLBACK_FAILED');
    }
  },

  async callGemini(prompt) {
    const key = this.getApiKey();
    if (!key) throw new Error('NO_KEY');

    const now = Date.now();
    const elapsed = now - this._lastRequestTime;
    if (elapsed < 3000) {
      await new Promise(r => setTimeout(r, 3000 - elapsed));
    }
    this._lastRequestTime = Date.now();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL}:generateContent?key=${key}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error?.message || '';
      const errStatus = errBody.error?.status || '';

      if (res.status === 403 || errStatus === 'PERMISSION_DENIED' || errMsg.includes('API_KEY_INVALID')) {
        throw new Error('INVALID_KEY');
      }
      if (res.status === 429 || errStatus === 'RESOURCE_EXHAUSTED' || errMsg.includes('Quota')) {
        throw new Error('RATE_LIMIT');
      }
      throw new Error(errMsg || `API Error ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');

    return this._parseJsonResponse(text);
  },

  _parseJsonResponse(text) {
    try {
      return JSON.parse(text);
    } catch {
      // Try to extract from markdown block
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try { return JSON.parse(match[1].trim()); } catch (e) { }
      }
      // Try to extract first { to last }
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        try { return JSON.parse(text.substring(start, end + 1)); } catch (e) { }
      }

      throw new Error('Parse error (Raw data): ' + text.substring(0, 150));
    }
  },

  async testConnection() {
    return this.callGemini('Reply with exactly: {"status":"ok"}');
  },

  async testFallbackConnection() {
    return this.callFreeFallback('test', 'English');
  },

  async callPollinationsFallback(prompt) {
    try {
      const systemPrompt = 'You are a vocabulary generator. Return valid JSON only, without markdown formatting.';

      const res = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          model: 'openai',
          jsonMode: true
        })
      });

      if (!res.ok) throw new Error('Pollinations API failed with status ' + res.status);

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) throw new Error('Empty response from Pollinations OpenAI');

      return this._parseJsonResponse(content);
    } catch (err) {
      console.warn('Pollinations API failed:', err);
      throw err;
    }
  },

  async suggest(word, languageName) {
    const labels = getDialectLabels(languageName);
    const targetLang = languageName || 'English';
    const prompt = `You are a vocabulary card generator for people whose native language is Turkish and who are learning ${targetLang}.

Given the word "${word}" in ${targetLang}:

1. "translation": Provide the Turkish translation (the most common one).
2. "partOfSpeech": One of: noun, verb, adjective, adverb, phrase, other
3. "phoneticD1": IPA phonetic transcription for ${labels.d1} dialect, wrapped in slashes like /.../ 
4. "phoneticD2": IPA phonetic for ${labels.d2} dialect (use empty string "" if same as D1 or not applicable)
5. "altSpelling": Alternative spelling in the other dialect (e.g. colour vs color). Empty string if none.
6. "sentences": Array of exactly 2 objects, each with "en" (example sentence in ${targetLang}) and "tr" (Turkish translation of that sentence)

IMPORTANT:
- If the word is nonsense, misspelled, or doesn't exist, respond with: {"error": "This word does not appear to be valid."}
- All phonetics must use IPA symbols
- Sentences should be natural and useful for learners
- Your sentence examples MUST be in ${targetLang}, DO NOT write them in English unless ${targetLang} is English!

Respond with valid JSON only, no markdown formatting.`;

    // 1. If user has a Gemini key, try Gemini first
    if (this.hasKey()) {
      try {
        return await this.callGemini(prompt);
      } catch (err) {
        if (err.message === 'RATE_LIMIT' || err.message === 'INVALID_KEY') {
          console.warn(`Gemini failed (${err.message}), using free fallback...`);
        } else {
          throw err;
        }
      }
    }

    // 2. Free fallback: Wiktionary (phonetics) + Google Translate (sentences)
    return await this.callFreeFallback(word, languageName);
  }
};

// ──────────────────────────────────────────────────────────────────
// SETTINGS MODAL
// ──────────────────────────────────────────────────────────────────
function openSettings() {
  const keyInput = $('#input-api-key');
  const existing = AiService.getApiKey();
  keyInput.value = existing;
  keyInput.type = 'password';
  $('#api-key-status').innerHTML = '';

  if (existing) {
    $('#api-key-status').innerHTML = '<span class="status-ok">✓ API key saved</span>';
  }

  $('#modal-settings').classList.remove('hidden');
  setTimeout(() => keyInput.focus(), 100);
}

function closeSettings() {
  $('#modal-settings').classList.add('hidden');
}

function saveApiKey() {
  const key = $('#input-api-key').value.trim();
  if (!key) {
    AiService.setApiKey('');
    $('#api-key-status').innerHTML = '<span class="status-ok">✓ Removed AI Key. Dictionary API is active.</span>';
    toast('API key removed. Using free Dictionary API.');
    updateAiStatusDot();
    return;
  }
  AiService.setApiKey(key);
  $('#api-key-status').innerHTML = '<span class="status-ok">✓ Key saved successfully</span>';
  toast('API key saved! 🔑');
  updateAiStatusDot();
}

async function testApiKey() {
  const key = $('#input-api-key').value.trim();
  const statusEl = $('#api-key-status');

  if (!key) {
    statusEl.innerHTML = '<span class="status-testing">⏳ Testing Free Dictionary API…</span>';
    try {
      await AiService.testFallbackConnection();
      statusEl.innerHTML = '<span class="status-ok">✓ Free Dictionary API is active and working perfectly!</span>';
      toast('Free API is working! ✅');
    } catch (err) {
      statusEl.innerHTML = '<span class="status-error">✗ Dictionary API failed. Please try again later.</span>';
      toast('Free API test failed.', 'error');
    }
    return;
  }

  statusEl.innerHTML = '<span class="status-testing">⏳ Testing Gemini API connection…</span>';

  const prevKey = AiService.getApiKey();
  AiService.setApiKey(key);

  try {
    await AiService.testConnection();
    statusEl.innerHTML = '<span class="status-ok">✓ Connection successful! API key is valid.</span>';
    toast('Gemini Connection successful! ✅');
  } catch (err) {
    if (prevKey) AiService.setApiKey(prevKey);
    else localStorage.removeItem(AiService.STORAGE_KEY);

    if (err.message === 'INVALID_KEY') {
      statusEl.innerHTML = '<span class="status-error">✗ Invalid API key. Please check and try again.</span>';
      toast('Invalid API key.', 'error');
    } else if (err.message === 'RATE_LIMIT') {
      statusEl.innerHTML = '<span class="status-warning">⚠️ Gemini Quota Exceeded. Free Dictionary API will be used instead. Auto-saving empty key.</span>';
      AiService.setApiKey('');
      $('#input-api-key').value = '';
      updateAiStatusDot();
      toast('Gemini Quota full. Switched to Free API automatically.', 'error');
    } else {
      statusEl.innerHTML = `<span class="status-error">✗ ${err.message}</span>`;
      toast('Connection failed.', 'error');
    }
  }
}

function toggleKeyVisibility() {
  const input = $('#input-api-key');
  input.type = input.type === 'password' ? 'text' : 'password';
}

// ──────────────────────────────────────────────────────────────────
// AI SUGGEST HANDLER
// ──────────────────────────────────────────────────────────────────
async function handleAiSuggest() {
  const word = $('#input-word').value.trim();
  if (!word) {
    toast('Please enter a word first.', 'error');
    $('#input-word').focus();
    return;
  }

  // Loading state
  const btn = $('#btn-ai-suggest');
  const btnText = btn.querySelector('.ai-btn-text');
  const btnIcon = btn.querySelector('.ai-btn-icon');
  const loading = $('#ai-loading');

  btn.disabled = true;
  btnText.textContent = 'Thinking…';
  btnIcon.classList.add('hidden');
  loading.classList.remove('hidden');

  try {
    const lang = State.currentLanguage;
    const result = await AiService.suggest(word, lang?.name || 'English');

    if (result.error) {
      toast(result.error, 'error');
      return;
    }

    // Apply suggestions with glow animation
    applyAiSuggestion(result);
    toast('AI suggestions applied! ✨');

  } catch (err) {
    toast('AI suggestion failed. Try again.', 'error');
    console.error('AI error:', err);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'AI Suggest';
    btnIcon.classList.remove('hidden');
    loading.classList.add('hidden');
  }
}

function applyAiSuggestion(result) {
  const glowFields = [];

  // Translation
  if (result.translation) {
    $('#input-translation').value = result.translation;
    glowFields.push('#input-translation');
  }

  // Part of Speech
  if (result.partOfSpeech) {
    const posEl = $('#input-pos');
    const validPos = ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'other'];
    const rawPos = result.partOfSpeech.toLowerCase();

    // Fuzzy match for POS handling
    let matched = validPos.find(v => rawPos.includes(v));
    if (!matched) {
      if (rawPos.includes('adj')) matched = 'adjective';
      else if (rawPos.includes('adv')) matched = 'adverb';
      else matched = 'other';
    }

    posEl.value = matched;
    glowFields.push('#input-pos');
  }

  // Phonetics
  if (result.phoneticD1) {
    $('#input-phonetic-us').value = result.phoneticD1;
    glowFields.push('#input-phonetic-us');
  }
  if (result.phoneticD2) {
    $('#input-phonetic-gb').value = result.phoneticD2;
    glowFields.push('#input-phonetic-gb');
  }

  // Alt spelling
  if (result.altSpelling) {
    $('#input-alt-spelling').value = result.altSpelling;
    glowFields.push('#input-alt-spelling');
  }

  // Sentences
  if (result.sentences && result.sentences.length > 0) {
    const container = $('#sentence-pairs-container');
    const existingPairs = Array.from(container.querySelectorAll('.sentence-pair'));

    let aiIndex = 0;

    // 1. Try to fill existing empty boxes so user's typed entries are left completely untouched
    existingPairs.forEach(pair => {
      const enInput = pair.querySelector('.input-sent-en');
      const trInput = pair.querySelector('.input-sent-tr');
      // Box is considered empty if both EN and TR are totally empty
      const isEmpty = enInput && trInput && !enInput.value.trim() && !trInput.value.trim();

      if (isEmpty && aiIndex < result.sentences.length) {
        enInput.value = result.sentences[aiIndex].en;
        trInput.value = result.sentences[aiIndex].tr;
        glowFields.push(`#${enInput.id}`);
        glowFields.push(`#${trInput.id}`);
        aiIndex++;
      }
    });

    // 2. If there are still AI sentences left, create new boxes for them (up to MAX_SENTENCES)
    let currentTotalBoxes = existingPairs.length;
    while (aiIndex < result.sentences.length && currentTotalBoxes < MAX_SENTENCES) {
      const s = result.sentences[aiIndex];
      const pair = createSentencePair(currentTotalBoxes, s, State.currentLanguage);
      container.appendChild(pair);
      setTimeout(() => pair.classList.add('open'), 10);

      const enInput = pair.querySelector('.input-sent-en');
      const trInput = pair.querySelector('.input-sent-tr');
      if (enInput) glowFields.push(`#${enInput.id}`);
      if (trInput) glowFields.push(`#${trInput.id}`);

      currentTotalBoxes++;
      aiIndex++;
    }

    // Update counter
    const display = $('#sentence-count-display');
    if (display) display.textContent = currentTotalBoxes;
    const lbl = $('#sentence-counter-label');
    if (lbl) lbl.textContent = `${currentTotalBoxes} sentence${currentTotalBoxes !== 1 ? 's' : ''}`;
    const decBtn = $('#btn-dec-sentences');
    const incBtn = $('#btn-inc-sentences');
    if (decBtn) decBtn.disabled = currentTotalBoxes === 0;
    if (incBtn) incBtn.disabled = currentTotalBoxes >= MAX_SENTENCES;
  }

  // Glow animation on filled fields
  glowFields.forEach((sel, i) => {
    const el = $(sel);
    if (!el) return;
    setTimeout(() => {
      el.classList.add('ai-glow');
      setTimeout(() => el.classList.remove('ai-glow'), 1200);
    }, i * 80);
  });
}

// ──────────────────────────────────────────────────────────────────
// AI STATUS DOT
// ──────────────────────────────────────────────────────────────────
function updateAiStatusDot() {
  const dot = $('#ai-status-dot');
  if (!dot) return;
  if (AiService.hasKey()) {
    dot.classList.add('active');
    dot.title = 'AI key configured';
  } else {
    dot.classList.remove('active');
    dot.title = 'Using free Dictionary API';
  }
}

function injectMissingOxfordDecks() {
  if (typeof OXFORD_3000 === 'undefined') return;

  const existing = Storage.load();
  if (!existing || !existing.languages) return;

  // Find or create English language
  let langEn = existing.languages.find(l => l.name === 'English');
  if (!langEn) {
    langEn = { id: uuid(), name: 'English', flag: '🇬🇧' };
    existing.languages.push(langEn);
  }

  const levelNames = {
    A1: 'Oxford 3000 · A1 (Beginner)',
    A2: 'Oxford 3000 · A2 (Elementary)',
    B1: 'Oxford 3000 · B1 (Intermediate)',
    B2: 'Oxford 3000 · B2 (Upper-Intermediate)'
  };

  let modified = false;

  ['A1', 'A2', 'B1', 'B2'].forEach(level => {
    const deckName = levelNames[level];
    const hasDeck = existing.decks.some(d => d.name === deckName);

    if (!hasDeck) {
      const words = OXFORD_3000[level];
      if (words && words.length > 0) {
        existing.decks.push({
          id: uuid(),
          languageId: langEn.id,
          name: deckName,
          createdAt: new Date().toISOString(),
          studiedCount: 0,
          cards: words.map(w => ({
            id: uuid(),
            word: w.w,
            translation: w.tr || '',
            partOfSpeech: w.p || 'noun',
            phoneticUS: w.pUS || '',
            phoneticGB: w.pGB || '',
            altSpelling: '',
            phonetic: '',
            sentences: w.ex ? [{ en: w.ex, tr: w.exTr || '' }] : []
          }))
        });
        modified = true;
      }
    } else {
      // If deck exists, ensure its cards have the enriched data (translations & examples) and fixed POS
      const deck = existing.decks.find(d => d.name === deckName);
      if (deck && deck.cards.length > 0) {
        const words = OXFORD_3000[level];
        if (words && words.length === deck.cards.length) {
          deck.cards = deck.cards.map((c, i) => {
            const w = words[i];
            const updated = {
              ...c,
              translation: w.tr || c.translation,
              partOfSpeech: w.p || c.partOfSpeech,
              phoneticUS: w.pUS || c.phoneticUS,
              phoneticGB: w.pGB || c.phoneticGB,
              sentences: w.ex ? [{ en: w.ex, tr: w.exTr || '' }] : c.sentences
            };
            if (!c.translation || c.partOfSpeech !== updated.partOfSpeech) {
              modified = true;
            }
            return updated;
          });
        }
      }
    }
  });

  if (typeof OXFORD_C1 !== 'undefined' && OXFORD_C1.length > 0) {
    const c1Name = 'Oxford 5000 · C1 (Advanced)';
    const deck = existing.decks.find(d => d.name === c1Name);

    if (!deck) {
      existing.decks.push({
        id: uuid(),
        languageId: langEn.id,
        name: c1Name,
        createdAt: new Date().toISOString(),
        studiedCount: 0,
        cards: OXFORD_C1.map(w => ({
          id: uuid(),
          word: w.word,
          translation: w.translation || '',
          partOfSpeech: w.partOfSpeech || 'noun',
          phoneticUS: w.phoneticUS || '',
          phoneticGB: w.phoneticGB || '',
          altSpelling: '',
          phonetic: '',
          sentences: w.sentences || []
        }))
      });
      modified = true;
    } else {
      if (deck.cards.length === OXFORD_C1.length) {
        deck.cards = deck.cards.map((c, i) => {
          const w = OXFORD_C1[i];
          const updated = {
            ...c,
            partOfSpeech: w.partOfSpeech || c.partOfSpeech
          };
          if (c.partOfSpeech !== updated.partOfSpeech) {
            modified = true;
          }
          return updated;
        });
      }
    }
  }

  if (modified) {
    Storage.save(existing);
  }
}

// ──────────────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────────────
function injectMissingSpanishDecks() {
  if (typeof SPANISH_A1 === 'undefined') return;

  const existing = Storage.load();
  if (!existing || !existing.languages) return;

  let langEs = existing.languages.find(l => l.name === 'Spanish');
  if (!langEs) {
    langEs = { id: uuid(), name: 'Spanish', flag: '🇪🇸' };
    existing.languages.push(langEs);
  }

  const levels = [
    { id: 'A1', name: 'Spanish · A1 (Beginner)', data: SPANISH_A1 },
    { id: 'A2', name: 'Spanish · A2 (Elementary)', data: SPANISH_A2 },
    { id: 'B1', name: 'Spanish · B1 (Intermediate)', data: SPANISH_B1 },
    { id: 'B2', name: 'Spanish · B2 (Upper-Intermediate)', data: SPANISH_B2 }
  ];

  let modified = false;
  levels.forEach(level => {
    if (!level.data || level.data.length === 0) return;
    const hasDeck = existing.decks.some(d => d.name === level.name);

    if (!hasDeck) {
      existing.decks.push({
        id: uuid(),
        languageId: langEs.id,
        name: level.name,
        createdAt: new Date().toISOString(),
        studiedCount: 0,
        cards: level.data.map(w => ({
          id: uuid(),
          word: w.word,
          translation: w.translation || '',
          partOfSpeech: w.partOfSpeech || 'noun',
          phoneticUS: w.phoneticUS || '',
          phoneticGB: w.phoneticGB || '',
          altSpelling: '',
          phonetic: '',
          sentences: w.sentences || []
        }))
      });
      modified = true;
    }
  });

  if (modified) {
    Storage.save(existing);
  }
}

function injectMissingLanguageDecks(langName, langFlag, dataA1, dataA2, dataB1, dataB2) {
  if (!dataA1 || dataA1.length === 0) return;

  const existing = Storage.load();
  if (!existing || !existing.languages) return;

  let lang = existing.languages.find(l => l.name === langName);
  if (!lang) {
    lang = { id: uuid(), name: langName, flag: langFlag };
    existing.languages.push(lang);
  }

  const levelsData = [
    { level: 'A1', data: dataA1 },
    { level: 'A2', data: dataA2 },
    { level: 'B1', data: dataB1 },
    { level: 'B2', data: dataB2 }
  ];
  let modified = false;

  levelsData.forEach(({ level, data }) => {
    if (!data || data.length === 0) return;
    const deckName = `${langName} Vocabulary · ${level}`;
    const hasDeck = existing.decks.some(d => d.name === deckName);

    if (!hasDeck) {
      existing.decks.push({
        id: uuid(),
        languageId: lang.id,
        name: deckName,
        createdAt: new Date().toISOString(),
        studiedCount: 0,
        cards: data.map(w => ({
          id: uuid(),
          word: w.word,
          translation: w.translation || '',
          partOfSpeech: w.partOfSpeech || 'noun',
          phoneticUS: w.phoneticUS || w.phonetic || '',
          phoneticGB: w.phoneticGB || '',
          altSpelling: w.altSpelling || '',
          phonetic: '',
          sentences: w.sentences || []
        }))
      });
      modified = true;
    }
  });

  if (modified) {
    Storage.save(existing);
  }
}

function init() {
  seedDemoData();
  injectMissingOxfordDecks(); // Auto-inject Oxford decks if missing
  injectMissingSpanishDecks(); // Auto-inject Spanish decks if missing
  if (typeof ITALIAN_A1 !== 'undefined') {
    injectMissingLanguageDecks('Italian', '🇮🇹', ITALIAN_A1, ITALIAN_A2, ITALIAN_B1, ITALIAN_B2);
  }
  if (typeof FRENCH_A1 !== 'undefined') {
    injectMissingLanguageDecks('French', '🇫🇷', FRENCH_A1, FRENCH_A2, FRENCH_B1, FRENCH_B2);
  }

  const data = Storage.load();
  State.languages = data.languages || [];
  State.decks = data.decks || [];

  initEvents();
  renderLanguageHome();
  updateAiStatusDot();

  // Parse any static emoji (preset buttons in modal, etc.) once on load
  setTimeout(() => parseTwemoji(), 200);
}

function handleAndroidBack() {
  // Close any open modal first (modal backdrops have class 'modal-backdrop')
  const openModal = document.querySelector('.modal-backdrop:not(.hidden)');
  if (openModal) {
    openModal.classList.add('hidden');
    return;
  }

  // Navigate back based on the current active screen
  const deck = document.getElementById('screen-deck');
  const lang = document.getElementById('screen-lang-decks');
  const study = document.getElementById('screen-study');
  const swipe = document.getElementById('screen-swipe-study');

  if (swipe && swipe.classList.contains('active')) {
    // Clean up gesture listeners before leaving
    cleanupSwipeGestures();
    State.currentDeckId = SwipeState.deckId;
    renderDeckView();
    return;
  }
  if (study && study.classList.contains('active')) {
    if (State.studyDeckId) State.currentDeckId = State.studyDeckId;
    renderDeckView();
    return;
  }
  if (deck && deck.classList.contains('active')) {
    if (State.currentLanguageId) openLanguageView(State.currentLanguageId);
    else renderLanguageHome();
    return;
  }
  if (lang && lang.classList.contains('active')) {
    renderLanguageHome();
    return;
  }
  // At home screen — let the native side handle it (minimize/exit app)
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.minimizeApp();
  } else if (navigator.app && navigator.app.exitApp) {
    navigator.app.exitApp();
  }
}

document.addEventListener('DOMContentLoaded', init);
