/* =========================================
   Wordlle — app.js
   ========================================= */

(function () {
  'use strict';

  /* ---- Constants ---- */
  const WORD_LEN    = 5;
  const MAX_TRIES   = 6;
  const EPOCH       = new Date('2024-01-01T00:00:00Z').getTime();
  const STORAGE_KEY = 'wordlle_state';

  /* ---- Game index (day + new-game offset) ---- */
  let gameOffset = 0; // loaded in init()

  function getDayIndex () {
    const now = new Date();
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.floor((utcMidnight - EPOCH) / 86400000);
  }

  function getGameIndex () {
    return getDayIndex() + gameOffset;
  }

  function getWordOfDay () {
    const idx = Math.floor(Math.random() * cleanAnswers.length);
    return cleanAnswers[idx].toLowerCase();
  }

  /* ---- State ---- */
  let answer       = '';
  let guesses      = [];
  let currentRow   = 0;
  let currentInput = '';
  let gameOver     = false;
  let isRevealing  = false;

  /* ---- DOM refs ---- */
  const board     = document.getElementById('board');
  const keyboard  = document.getElementById('keyboard');
  const toastWrap = document.getElementById('toast-container');

  /* ---- Build Board ---- */
  function buildBoard () {
    board.innerHTML = '';
    for (let r = 0; r < MAX_TRIES; r++) {
      const row = document.createElement('div');
      row.classList.add('row');
      row.id = `row-${r}`;
      for (let c = 0; c < WORD_LEN; c++) {
        const tile = document.createElement('div');
        tile.classList.add('tile');
        tile.id = `tile-${r}-${c}`;
        row.appendChild(tile);
      }
      board.appendChild(row);
    }
  }

  /* ---- Build Keyboard ---- */
  const KB_ROWS = [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['Enter','z','x','c','v','b','n','m','⌫']
  ];

  function buildKeyboard () {
    keyboard.innerHTML = '';
    KB_ROWS.forEach(keys => {
      const row = document.createElement('div');
      row.classList.add('kb-row');
      keys.forEach(k => {
        const btn = document.createElement('button');
        btn.classList.add('key');
        btn.textContent = k;
        btn.dataset.key = k;
        if (k === 'Enter' || k === '⌫') btn.classList.add('wide');
        btn.setAttribute('tabindex', '-1');            // keep out of tab order
        btn.addEventListener('mousedown', e => e.preventDefault()); // prevent focus steal on click
        btn.addEventListener('click', () => { handleKey(k); btn.blur(); }); // release any focus on mobile
        row.appendChild(btn);
      });
      keyboard.appendChild(row);
    });
  }

  /* ---- Tile helpers ---- */
  function getTile (r, c) {
    return document.getElementById(`tile-${r}-${c}`);
  }

  function setTileLetter (r, c, letter) {
    const tile = getTile(r, c);
    tile.textContent = letter.toUpperCase();
    tile.dataset.letter = letter;
  }

  function removeTileLetter (r, c) {
    const tile = getTile(r, c);
    tile.textContent = '';
    delete tile.dataset.letter;
  }

  /* ---- Input handling ---- */
  function handleKey (key) {
    if (gameOver || isRevealing) return;

    if (key === 'Enter') {
      submitGuess();
    } else if (key === '⌫' || key === 'Backspace') {
      deleteLetter();
    } else if (/^[a-zA-Z]$/.test(key)) {
      addLetter(key.toLowerCase());
    }
  }

  function addLetter (letter) {
    if (currentInput.length >= WORD_LEN) return;
    const col = currentInput.length;
    setTileLetter(currentRow, col, letter);
    currentInput += letter;
  }

  function deleteLetter () {
    if (currentInput.length === 0) return;
    currentInput = currentInput.slice(0, -1);
    removeTileLetter(currentRow, currentInput.length);
  }

  /* ---- Evaluate guess ---- */
  function evaluateGuess (guess) {
    const result    = Array(WORD_LEN).fill('absent');
    const answerArr = answer.split('');
    const guessArr  = guess.split('');
    const used      = Array(WORD_LEN).fill(false);

    // Pass 1: correct position
    for (let i = 0; i < WORD_LEN; i++) {
      if (guessArr[i] === answerArr[i]) {
        result[i] = 'correct';
        used[i]   = true;
      }
    }

    // Pass 2: present but wrong position
    for (let i = 0; i < WORD_LEN; i++) {
      if (result[i] === 'correct') continue;
      for (let j = 0; j < WORD_LEN; j++) {
        if (!used[j] && guessArr[i] === answerArr[j]) {
          result[i] = 'present';
          used[j]   = true;
          break;
        }
      }
    }

    return result;
  }

  /* ---- Submit guess ---- */
  function submitGuess () {
    if (currentInput.length < WORD_LEN) {
      showToast('Not enough letters');
      shakeRow(currentRow);
      return;
    }

    if (!VALID_GUESSES.has(currentInput)) {
      showToast('Not in word list');
      shakeRow(currentRow);
      return;
    }

    const states = evaluateGuess(currentInput);
    const guess  = currentInput;
    guesses.push(guess);
    revealRow(currentRow, guess, states);
  }

  /* ---- Reveal row (flip animation) ---- */
  function revealRow (rowIdx, guess, states) {
    const FLIP_DURATION = 500;
    const FLIP_GAP      = 300;
    isRevealing = true;

    for (let c = 0; c < WORD_LEN; c++) {
      const tile  = getTile(rowIdx, c);
      const delay = c * FLIP_GAP;

      tile.style.setProperty('--flip-duration', `${FLIP_DURATION}ms`);
      tile.style.setProperty('--flip-delay',    `${delay}ms`);
      tile.style.setProperty('--tile-bg',       getStateColor(states[c]));
      tile.classList.add('flip');

      setTimeout(() => { tile.dataset.state = states[c]; }, delay);
    }

    const totalDelay = WORD_LEN * FLIP_GAP + FLIP_DURATION;

    setTimeout(() => {
      updateKeyboard(guess, states);
      isRevealing = false;
      const won = states.every(s => s === 'correct');

      if (won) {
        gameOver = true;
        saveStats(true, rowIdx + 1);
        saveState();
        showDefinitionForWord(answer);
        const msgs = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
        showToast(msgs[rowIdx] || 'Nice!', 2000);
        setTimeout(() => {
          bounceRow(rowIdx);
          setTimeout(() => openStatsModal(), 1600);
        }, 300);
      } else if (rowIdx + 1 >= MAX_TRIES) {
        gameOver = true;
        saveStats(false, 0);
        saveState();
        showDefinitionForWord(answer);
        showToast(answer.toUpperCase(), 3500);
        setTimeout(() => openStatsModal(), 3600);
      } else {
        currentRow++;
        currentInput = '';
        saveState();
      }
    }, totalDelay);
  }

  function getStateColor (state) {
    const map = { correct: '#538d4e', present: '#b59f3b', absent: '#3a3a3c' };
    if (document.body.classList.contains('light')) map.absent = '#787c7e';
    return map[state];
  }

  /* ---- Keyboard state ---- */
  const keyStates = {};

  function updateKeyboard (guess, states) {
    const priority = { correct: 3, present: 2, absent: 1 };
    for (let i = 0; i < WORD_LEN; i++) {
      const letter   = guess[i];
      const newState = states[i];
      const cur      = keyStates[letter];
      if (!cur || priority[newState] > priority[cur]) {
        keyStates[letter] = newState;
        const btn = keyboard.querySelector(`[data-key="${letter}"]`);
        if (btn) btn.dataset.state = newState;
      }
    }
  }

  /* ---- Animations ---- */
  function shakeRow (rowIdx) {
    const row = document.getElementById(`row-${rowIdx}`);
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
    row.addEventListener('animationend', () => row.classList.remove('shake'), { once: true });
  }

  function bounceRow (rowIdx) {
    const row   = document.getElementById(`row-${rowIdx}`);
    const tiles = row.querySelectorAll('.tile');
    tiles.forEach((t, i) => {
      t.style.setProperty('--bounce-delay', `${i * 100}ms`);
      t.style.setProperty('--bounce-dur', '0.8s');
    });
    row.classList.add('bounce');
  }

  /* ---- Toast ---- */
  function showToast (msg, duration = 1500) {
    const el = document.createElement('div');
    el.classList.add('toast');
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(() => el.remove(), duration + 300);
  }

  /* ---- Definition ---- */
  function showDefinitionForWord (word) {
    const panel  = document.getElementById('definition-panel');
    const wordEl = document.getElementById('def-word');
    const posEl  = document.getElementById('def-pos');
    const textEl = document.getElementById('def-text');

    wordEl.textContent = word;
    posEl.textContent  = '';
    textEl.textContent = 'Looking up definition\u2026';
    panel.hidden = false;

    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const meaning = data[0]?.meanings?.[0];
        posEl.textContent  = meaning?.partOfSpeech ? ` · ${meaning.partOfSpeech}` : '';
        textEl.textContent = meaning?.definitions?.[0]?.definition || 'No definition found.';
      })
      .catch(() => {
        posEl.textContent  = '';
        textEl.textContent = 'Definition unavailable.';
      });
  }

  function hideDefinition () {
    const panel = document.getElementById('definition-panel');
    panel.hidden = true;
    document.getElementById('def-word').textContent = '';
    document.getElementById('def-pos').textContent  = '';
    document.getElementById('def-text').textContent = '';
  }

  /* ---- Stats ---- */
  function loadStats () {
    try {
      return JSON.parse(localStorage.getItem('wordlle_stats')) || defaultStats();
    } catch {
      return defaultStats();
    }
  }

  function defaultStats () {
    return { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0,0,0,0,0,0] };
  }

  function saveStats (won, guessCount) {
    const s = loadStats();
    s.played++;
    if (won) {
      s.wins++;
      s.streak++;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
      s.dist[guessCount - 1]++;
    } else {
      s.streak = 0;
    }
    localStorage.setItem('wordlle_stats', JSON.stringify(s));
  }

  /* ---- Persistence: save/restore current game ---- */
  function saveState () {
    const state = {
      gameIndex: getGameIndex(),   // identifies this specific game
      guesses,
      currentRow,
      currentInput,
      gameOver,
      keyStates: { ...keyStates }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function restoreState () {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw);
      if (state.gameIndex !== getGameIndex()) return false; // different game

      guesses      = state.guesses      || [];
      currentRow   = state.currentRow   || 0;
      currentInput = state.currentInput || '';
      gameOver     = state.gameOver     || false;

      // Replay guesses visually (no animation)
      guesses.forEach((g, rowIdx) => {
        const states = evaluateGuess(g);
        for (let c = 0; c < WORD_LEN; c++) {
          const tile = getTile(rowIdx, c);
          tile.textContent    = g[c].toUpperCase();
          tile.dataset.letter = g[c];
          tile.dataset.state  = states[c];
        }
        updateKeyboard(g, states);
      });

      // Restore in-progress letters
      for (let c = 0; c < currentInput.length; c++) {
        setTileLetter(currentRow, c, currentInput[c]);
      }

      // Restore key colours
      Object.entries(state.keyStates || {}).forEach(([k, s]) => {
        const btn = keyboard.querySelector(`[data-key="${k}"]`);
        if (btn) btn.dataset.state = s;
        keyStates[k] = s;
      });

      return true;
    } catch {
      return false;
    }
  }

  /* ---- New Game ---- */
  function startNewGame () {
    // Advance to next word
    gameOffset++;
    localStorage.setItem('wordlle_offset', gameOffset);
    localStorage.removeItem(STORAGE_KEY);

    // Reset in-memory state
    guesses      = [];
    currentRow   = 0;
    currentInput = '';
    gameOver     = false;
    isRevealing  = false;
    Object.keys(keyStates).forEach(k => delete keyStates[k]);

    // Pick new answer
    answer = getWordOfDay();

    // Rebuild board and keyboard
    buildBoard();
    buildKeyboard();

    // Clear definition panel
    hideDefinition();

    // Close the stats modal
    document.getElementById('stats-modal').classList.remove('open');
  }

  /* ---- Stats Modal ---- */
  function openStatsModal () {
    const modal   = document.getElementById('stats-modal');
    const s       = loadStats();
    const pct     = s.played ? Math.round((s.wins / s.played) * 100) : 0;
    const maxDist = Math.max(...s.dist, 1);

    document.getElementById('stat-played').textContent  = s.played;
    document.getElementById('stat-win-pct').textContent = pct;
    document.getElementById('stat-streak').textContent  = s.streak;
    document.getElementById('stat-max').textContent     = s.maxStreak;

    const distContainer = document.getElementById('dist-bars');
    distContainer.innerHTML = '';
    s.dist.forEach((count, i) => {
      const row   = document.createElement('div');
      row.classList.add('dist-row');

      const numEl = document.createElement('span');
      numEl.classList.add('dist-num');
      numEl.textContent = i + 1;

      const wrap = document.createElement('div');
      wrap.classList.add('dist-bar-wrap');

      const bar = document.createElement('div');
      bar.classList.add('dist-bar');
      if (gameOver && guesses.length === i + 1) bar.classList.add('current');
      bar.textContent = count;
      bar.style.width = `max(22px, ${Math.round((count / maxDist) * 100)}%)`;

      wrap.appendChild(bar);
      row.appendChild(numEl);
      row.appendChild(wrap);
      distContainer.appendChild(row);
    });

    // Share only available when game is over
    document.getElementById('share-btn').classList.toggle('visible', gameOver);

    modal.classList.add('open');
  }

  /* ---- Share ---- */
  function buildShareText () {
    const gameNum = getGameIndex() + 1;
    const result  = gameOver && guesses.length > 0
      ? `${guesses.length}/${MAX_TRIES}`
      : 'X/6';

    const emoji = { correct: '🟩', present: '🟨', absent: '⬛' };
    const rows  = guesses.map(g => {
      const states = evaluateGuess(g);
      return states.map(s => emoji[s]).join('');
    }).join('\n');

    return `Wordlle #${gameNum} ${result}\n\n${rows}`;
  }

  /* ---- Theme toggle ---- */
  function initTheme () {
    const saved = localStorage.getItem('wordlle_theme') || 'dark';
    if (saved === 'light') document.body.classList.add('light');
    updateThemeIcon();
  }

  function toggleTheme () {
    document.body.classList.toggle('light');
    const t = document.body.classList.contains('light') ? 'light' : 'dark';
    localStorage.setItem('wordlle_theme', t);
    updateThemeIcon();
  }

  function updateThemeIcon () {
    const btn   = document.getElementById('theme-btn');
    const light = document.body.classList.contains('light');
    btn.innerHTML = light
      ? `<svg viewBox="0 0 24 24"><path d="M12 3v1m0 16v1M4.22 4.22l.7.7m12.16 12.16.7.7M3 12h1m16 0h1M4.92 19.07l.7-.7M18.36 5.64l.7-.7M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>`
      : `<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>`;
    btn.title = light ? 'Switch to dark mode' : 'Switch to light mode';
  }

  /* ---- Event wiring ---- */
  function wireEvents () {
    document.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      handleKey(e.key);
    });

    document.getElementById('help-btn').addEventListener('click', () => {
      document.getElementById('help-modal').classList.add('open');
    });
    document.getElementById('stats-btn').addEventListener('click', openStatsModal);
    document.getElementById('theme-btn').addEventListener('click', toggleTheme);

    // Close modals on overlay click or × button
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target === el) {
          el.closest('.modal-overlay')?.classList.remove('open');
          if (el.classList.contains('modal-overlay')) el.classList.remove('open');
        }
      });
    });

    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', e => e.stopPropagation());
    });

    // Share button
    document.getElementById('share-btn').addEventListener('click', () => {
      const text = buildShareText();
      navigator.clipboard.writeText(text)
        .then(() => showToast('Copied to clipboard!'))
        .catch(() => {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          showToast('Copied to clipboard!');
        });
    });

    // New Game button
    document.getElementById('new-game-btn').addEventListener('click', startNewGame);
  }

  /* ---- Background scene: stars & rain ---- */
  function initBackground () {
    // === STARS (night mode) ===
    const starField = document.getElementById('star-field');
    if (starField) {
      // Colours: mostly white/yellow, plus rare pink/blue/mint accent stars
      const palette = [
        '#ffffff','#ffffff','#ffffff','#fffde7','#fffde7',
        '#fff9c4','#e3f2fd','#fce4ec','#e0f7fa','#f3e5f5'
      ];
      const layers = [
        { count: 55, minPx: 1,   maxPx: 2   }, // tiny background stars
        { count: 22, minPx: 2,   maxPx: 3   }, // medium stars
        { count:  6, minPx: 3.2, maxPx: 5   }, // large glowing stars
      ];
      layers.forEach(({ count, minPx, maxPx }) => {
        for (let i = 0; i < count; i++) {
          const size  = minPx + Math.random() * (maxPx - minPx);
          const color = palette[Math.floor(Math.random() * palette.length)];
          const glow  = size > 2.8 ? `0 0 ${Math.round(size*2.5)}px ${Math.round(size)}px ${color}` : 'none';
          const el    = document.createElement('div');
          el.className = 'star';
          el.style.cssText =
            `width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;` +
            `top:${(Math.random() * 84).toFixed(1)}%;` +
            `left:${(Math.random() * 100).toFixed(1)}%;` +
            `background:${color};box-shadow:${glow};` +
            `--dur:${(2 + Math.random() * 4).toFixed(1)}s;` +
            `--delay:${-(Math.random() * 8).toFixed(1)}s;`;
          starField.appendChild(el);
        }
      });
    }

    // === RAIN (day mode) ===
    const rainWrap = document.getElementById('rain-wrap');
    if (rainWrap) {
      for (let i = 0; i < 48; i++) {
        const h   = 14 + Math.random() * 32;
        const el  = document.createElement('div');
        el.className = 'rain-drop';
        el.style.cssText =
          `left:${(Math.random() * 100).toFixed(1)}%;` +
          `height:${h.toFixed(0)}px;` +
          `animation-duration:${(0.55 + Math.random() * 0.75).toFixed(2)}s;` +
          `animation-delay:${-(Math.random() * 3).toFixed(2)}s;` +
          `opacity:${(0.35 + Math.random() * 0.45).toFixed(2)};`;
        rainWrap.appendChild(el);
      }
    }
  }

  /* ---- Init ---- */
  function init () {
    gameOffset = parseInt(localStorage.getItem('wordlle_offset') || '0');
    answer     = getWordOfDay();

    buildBoard();
    buildKeyboard();
    initTheme();
    initBackground();
    wireEvents();

    const restored = restoreState();
    if (!restored) {
      currentRow   = 0;
      currentInput = '';
      guesses      = [];
      gameOver     = false;
    }

    if (gameOver) {
      showDefinitionForWord(answer);
      setTimeout(() => openStatsModal(), 800);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();
