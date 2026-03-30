// board_watcher.js — isolated world
// Receives FEN from chesscom_main.js (MAIN world) via window events,
// falls back to CSS-piece reconstruction and data-fen attributes.
// Fires 'ct:position' CustomEvent on document for sidebar.js.

(function () {
  'use strict';

  const SITE = location.hostname.includes('chess.com') ? 'chesscom'
             : location.hostname.includes('lichess.org') ? 'lichess'
             : null;

  if (!SITE) return;

  function emit(fen, lastMove, source, playerColor) {
    document.dispatchEvent(new CustomEvent('ct:position', {
      detail: { fen, lastMove, site: SITE, source, playerColor: playerColor || 'white' }
    }));
  }

  // ─── chess.com ───────────────────────────────────────────────────────────────

  function watchChessCom() {
    let lastFen = '';

    // Layer A — FEN from MAIN world (board.game.getFEN)
    // chesscom_main.js dispatches this on window; it crosses the world boundary.
    window.addEventListener('ct:fen-from-page', ({ detail }) => {
      if (detail.fen && detail.fen !== lastFen) {
        lastFen = detail.fen;
        emit(detail.fen, null, detail.source || 'main-world', detail.playerColor);
      }
    });

    // Layer B — reconstruct FEN from piece CSS classes (no castling/en-passant)
    // Piece divs: class="piece wp square-52"  (w/b)(p/r/n/b/q/k)  square-FileRank
    const PIECE_RE = /^[wb][prnbqk]$/;

    function fenFromDOM(board) {
      let fen = '';
      for (let rank = 8; rank >= 1; rank--) {
        let empty = 0;
        for (let file = 1; file <= 8; file++) {
          const el = board.querySelector(`.piece.square-${file}${rank}`);
          if (el) {
            if (empty) { fen += empty; empty = 0; }
            let sym = null;
            for (const cls of el.classList) {
              if (PIECE_RE.test(cls)) {
                sym = cls[0] === 'w' ? cls[1].toUpperCase() : cls[1];
                break;
              }
            }
            fen += sym || '?';
          } else {
            empty++;
          }
        }
        if (empty) fen += empty;
        if (rank > 1) fen += '/';
      }
      return fen;
    }

    // Guess turn from ply count in the move list
    function guessTurn() {
      const plies = document.querySelectorAll('div[data-ply]').length;
      return plies % 2 === 0 ? 'w' : 'b';
    }

    function tryFallback() {
      // Only fall back if Layer A hasn't produced anything yet
      if (lastFen) return;

      const board = document.querySelector('chess-board') ||
                    document.querySelector('wc-chess-board');
      if (!board) return;

      // Layer B
      const pos = fenFromDOM(board);
      if (pos && !pos.includes('?')) {
        const fen = `${pos} ${guessTurn()} - - 0 1`;
        if (fen !== lastFen) {
          lastFen = fen;
          emit(fen, null, 'dom-pieces');
        }
        return;
      }

      // Layer C — data-fen attribute
      const fenEl = document.querySelector('[data-fen]');
      if (fenEl) {
        const fen = fenEl.getAttribute('data-fen');
        if (fen && fen !== lastFen) {
          lastFen = fen;
          emit(fen, null, 'data-fen-attr');
        }
      }
    }

    // Run fallback only at startup to show initial position while MAIN world wakes up
    setTimeout(tryFallback, 1500);
    setTimeout(tryFallback, 3000);
  }

  // ─── lichess ─────────────────────────────────────────────────────────────────

  function watchLichess() {
    let lastFen = '';

    function extract() {
      // window.lichess.analysis (analysis board)
      if (window.lichess) {
        try {
          const node = window.lichess.analysis?.tree?.getCurrentNode?.();
          if (node?.fen && node.fen !== lastFen) {
            lastFen = node.fen;
            emit(node.fen, node.uci || null, 'lichess.analysis');
            return;
          }
        } catch (_) {}
      }

      // Active move node carries data-fen
      const active = document.querySelector('kwdb.active, move.active, [data-uci].active');
      if (active) {
        const fen = active.getAttribute('data-fen') || active.getAttribute('fen');
        if (fen && fen !== lastFen) {
          lastFen = fen;
          emit(fen, active.getAttribute('data-uci') || null, 'active-move-attr');
          return;
        }
      }

      // cg-wrap data-fen fallback
      const fen = document.querySelector('cg-wrap, .cg-wrap')?.getAttribute('data-fen');
      if (fen && fen !== lastFen) {
        lastFen = fen;
        emit(fen, null, 'cg-wrap-attr');
      }
    }

    new MutationObserver(extract).observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['class', 'data-fen'],
    });

    setInterval(extract, 1000);
    extract();
  }

  // ─── Start ───────────────────────────────────────────────────────────────────

  if (SITE === 'chesscom') watchChessCom();
  if (SITE === 'lichess')  watchLichess();

})();
