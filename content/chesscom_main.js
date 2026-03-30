// chesscom_main.js — MAIN world: reads board.game, sends FEN + player color

(function () {
  'use strict';

  let lastFen   = '';
  const hooked  = new WeakSet();

  function getBoardEl() {
    return document.querySelector('chess-board') ||
           document.querySelector('wc-chess-board');
  }

  function getPlayerColor(board, game) {
    // getPlayingAs(): 1 = white, 2 = black
    try {
      const c = game.getPlayingAs();
      if (c === 1) return 'white';
      if (c === 2) return 'black';
    } catch (_) {}
    // Fallback: board is flipped when you play as black
    if (board.hasAttribute('flipped')) return 'black';
    return 'white';
  }

  function postFen(fen, source, board, game) {
    if (!fen || fen === lastFen) return;
    lastFen = fen;
    window.dispatchEvent(new CustomEvent('ct:fen-from-page', {
      detail: { fen, source, playerColor: getPlayerColor(board, game) }
    }));
  }

  function attachGame(board) {
    if (!board || !board.game || hooked.has(board)) return;
    hooked.add(board);
    const game = board.game;
    const onMove = () => {
      try { postFen(game.getFEN(), 'game.getFEN/event', board, game); } catch (_) {}
    };
    for (const evt of ['Move','MoveForward','MoveBackward','SelectNode','Undo','Load','ModeChanged']) {
      try { game.on(evt, onMove); } catch (_) {}
    }
    onMove();
  }

  function poll() {
    const board = getBoardEl();
    if (board && board.game) attachGame(board);
  }

  new MutationObserver(poll).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(poll, 500);
  poll();
})();
