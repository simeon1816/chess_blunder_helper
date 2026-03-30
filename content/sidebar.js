// sidebar.js — mini board for move selection, eval bar from player's perspective

(function () {
  'use strict';

  const ROOT_ID = 'ct-sidebar';
  if (document.getElementById(ROOT_ID)) return;

  // ─── State ───────────────────────────────────────────────────────────────────

  let currentFen     = null;
  let playerColor    = 'white';  // updated from ct:position events
  let selectedSquare = null;
  let validDests     = [];       // destination square names for selected piece

  // ─── Piece Unicode map ───────────────────────────────────────────────────────

  const PIECE = {
    wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
    bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟',
  };

  // ─── DOM ─────────────────────────────────────────────────────────────────────

  const sidebar = document.createElement('div');
  sidebar.id = ROOT_ID;
  sidebar.innerHTML = `
    <div id="ct-header">
      <span id="ct-title">♟ Chess Trainer</span>
      <button id="ct-toggle-btn">−</button>
    </div>
    <div id="ct-body">
      <div id="ct-eval-wrap">
        <div id="ct-eval-bar">
          <div id="ct-eval-fill"></div>
          <div id="ct-eval-label">—</div>
        </div>
        <div id="ct-miniboard"></div>
      </div>
      <div id="ct-hint">Select a piece, then click its destination</div>
      <div id="ct-candidate-result"></div>
      <div id="ct-status">Engine loading…</div>
      <div id="ct-debug-wrap">
        <div class="ct-label" id="ct-debug-toggle" style="cursor:pointer">▶ debug</div>
        <div id="ct-debug" style="display:none">
          <div id="ct-dbg-engine">engine: …</div>
          <div id="ct-dbg-fen">fen: —</div>
          <div id="ct-dbg-result">result: —</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(sidebar);

  // ─── Refs ─────────────────────────────────────────────────────────────────────

  const $ = id => document.getElementById(id);
  const elBody            = $('ct-body');
  const elToggleBtn       = $('ct-toggle-btn');
  const elEvalFill        = $('ct-eval-fill');
  const elEvalLabel       = $('ct-eval-label');
  const elMiniBoard       = $('ct-miniboard');
  const elHint            = $('ct-hint');
  const elCandidateResult = $('ct-candidate-result');
  const elStatus          = $('ct-status');
  const elDbgEngine       = $('ct-dbg-engine');
  const elDbgFen          = $('ct-dbg-fen');
  const elDbgResult       = $('ct-dbg-result');

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function setStatus(msg) {
    elStatus.textContent = msg;
    elStatus.style.display = msg ? '' : 'none';
  }

  function formatEval(v) {
    if (Math.abs(v) >= 99) return v > 0 ? 'M+' : 'M−';
    return (v >= 0 ? '+' : '') + v.toFixed(2);
  }

  // ─── Debug ───────────────────────────────────────────────────────────────────

  $('ct-debug-toggle').addEventListener('click', () => {
    const el = $('ct-debug');
    el.style.display = el.style.display === 'none' ? '' : 'none';
  });

  // ─── Collapse ────────────────────────────────────────────────────────────────

  let collapsed = false;
  elToggleBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    elBody.style.display = collapsed ? 'none' : '';
    elToggleBtn.textContent = collapsed ? '+' : '−';
  });

  // ─── Eval bar — always from player's perspective ──────────────────────────────
  //
  // Stockfish score (UCI) is from side-to-move perspective.
  // To show it from the user's POV:
  //   if side-to-move === user's color → keep sign
  //   otherwise                        → negate

  function updateEvalBar(rawEval, fen) {
    const sideToMove = fen ? fen.split(' ')[1] : 'w';   // 'w' or 'b'
    const userSide   = playerColor[0];                   // 'w' or 'b'
    const display    = (sideToMove === userSide) ? rawEval : -rawEval;

    const pct = ((Math.max(-6, Math.min(6, display)) + 6) / 12) * 100;
    elEvalFill.style.height = pct + '%';
    elEvalFill.style.background = display >= 0 ? '#f0f0f0' : '#333';
    elEvalLabel.textContent = formatEval(display);
  }

  // ─── Mini board ──────────────────────────────────────────────────────────────

  const cells = {};   // square name → <div>

  function buildBoard(fen, color) {
    if (typeof Chess === 'undefined') return;
    const chess   = new Chess(fen);
    const bd      = chess.board();    // [0]=rank8 … [7]=rank1, each row [0]=fileA…[7]=fileH
    const flipped = (color === 'black');

    elMiniBoard.innerHTML = '';
    Object.keys(cells).forEach(k => delete cells[k]);
    selectedSquare = null;
    validDests     = [];

    for (let dRow = 0; dRow < 8; dRow++) {
      for (let dCol = 0; dCol < 8; dCol++) {
        // Map display coords → board array coords
        const bRow = flipped ? 7 - dRow : dRow;
        const bCol = flipped ? 7 - dCol : dCol;

        const piece   = bd[bRow][bCol];
        const sqName  = 'abcdefgh'[bCol] + (8 - bRow);
        const isLight = (dRow + dCol) % 2 === 0;

        const cell = document.createElement('div');
        cell.className = 'ct-sq ' + (isLight ? 'ct-sq-light' : 'ct-sq-dark');
        cell.dataset.square = sqName;

        if (piece) {
          const span = document.createElement('span');
          span.className = piece.color === 'w' ? 'ct-pw' : 'ct-pb';
          span.textContent = PIECE[piece.color + piece.type.toUpperCase()] || '?';
          cell.appendChild(span);
        }

        cell.addEventListener('click', () => onCellClick(sqName));
        cells[sqName] = cell;
        elMiniBoard.appendChild(cell);
      }
    }
  }

  function clearHighlights() {
    Object.values(cells).forEach(c =>
      c.classList.remove('ct-sel', 'ct-valid', 'ct-capture')
    );
  }

  function onCellClick(sq) {
    if (!currentFen || typeof Chess === 'undefined') return;

    // Clicked a valid destination → submit the move
    if (selectedSquare && validDests.includes(sq)) {
      const chess = new Chess(currentFen);
      const piece = chess.get(selectedSquare);
      const toRank = parseInt(sq[1]);
      const isPromo = piece && piece.type === 'p' &&
                      ((piece.color === 'w' && toRank === 8) ||
                       (piece.color === 'b' && toRank === 1));

      const result = chess.move({ from: selectedSquare, to: sq, promotion: isPromo ? 'q' : undefined });
      if (result) {
        clearHighlights();
        selectedSquare = null;
        validDests     = [];
        elCandidateResult.className = '';
        elCandidateResult.textContent = 'Checking…';
        document.dispatchEvent(new CustomEvent('ct:check-candidate', {
          detail: { fen: currentFen, move: result.san }
        }));
      }
      return;
    }

    // Try to select a piece that belongs to the side to move
    const chess      = new Chess(currentFen);
    const piece      = chess.get(sq);
    const sideToMove = currentFen.split(' ')[1];   // 'w' or 'b'

    clearHighlights();

    if (piece && piece.color === sideToMove) {
      selectedSquare = sq;
      cells[sq] && cells[sq].classList.add('ct-sel');

      const moves = chess.moves({ square: sq, verbose: true });
      validDests = moves.map(m => m.to);
      moves.forEach(m => {
        const c = cells[m.to];
        if (c) c.classList.add(m.flags.includes('c') || m.flags.includes('e') ? 'ct-capture' : 'ct-valid');
      });
    } else {
      selectedSquare = null;
      validDests     = [];
    }
  }

  // ─── Event listeners ─────────────────────────────────────────────────────────

  document.addEventListener('ct:engine-status', ({ detail }) => {
    elDbgEngine.textContent = 'engine: ' + detail.status + (detail.error ? ' — ' + detail.error : '');
    if (detail.status === 'ready') setStatus('');
    if (detail.status === 'error') setStatus('Engine error: ' + detail.error);
  });

  document.addEventListener('ct:position', ({ detail }) => {
    currentFen  = detail.fen;
    if (detail.playerColor) playerColor = detail.playerColor;
    elCandidateResult.innerHTML = '';
    elCandidateResult.className = '';
    setStatus('Analyzing…');
    elDbgFen.textContent = 'fen: [' + detail.source + '] ' + detail.fen.slice(0, 28) + '…';
    buildBoard(detail.fen, playerColor);
  });

  document.addEventListener('ct:analysis', ({ detail }) => {
    if (detail.error) {
      setStatus('Error: ' + detail.error);
      elDbgResult.textContent = 'error: ' + detail.error;
      return;
    }
    updateEvalBar(detail.eval, detail.fen);
    setStatus('');
    elDbgResult.textContent = 'eval=' + formatEval(detail.eval) + ' best=' + detail.bestMove;
  });

  const LABELS = {
    ok:         { text: 'Good move',  css: 'ct-ok'         },
    inaccuracy: { text: 'Inaccuracy', css: 'ct-inaccuracy' },
    mistake:    { text: 'Mistake',    css: 'ct-mistake'    },
    blunder:    { text: 'Blunder!',   css: 'ct-blunder'    },
  };

  document.addEventListener('ct:candidate-result', ({ detail }) => {
    if (detail.error) {
      elCandidateResult.className = 'ct-error';
      elCandidateResult.textContent = detail.error;
      return;
    }
    const info = LABELS[detail.classification] || LABELS.ok;
    elCandidateResult.className = info.css;
    elCandidateResult.innerHTML =
      `<strong>${info.text}</strong><br>` +
      `Your move: ${formatEval(detail.candidateEval)}<br>` +
      `Best: ${detail.bestMove} (${formatEval(detail.bestEval)})<br>` +
      `Loss: ${detail.delta >= 0 ? '+' : ''}${detail.delta.toFixed(2)}`;
  });

  setTimeout(() => document.dispatchEvent(new CustomEvent('ct:ping')), 500);

})();
