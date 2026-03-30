// engine.js — content script (isolated world)
// Worker() works here. Handles Stockfish lifecycle and analysis via document events.
//
// Listens:  ct:position        → auto-analyze, fires ct:analysis
//           ct:check-candidate → evaluate move,  fires ct:candidate-result
//           ct:ping            → fires ct:engine-status
//
// Fires:    ct:analysis        { eval, bestMove, topMoves, fen }
//           ct:candidate-result{ move, bestMove, bestEval, candidateEval, delta, classification }
//                              | { error }
//           ct:engine-status   { status: 'ready'|'initializing'|'error', error? }

(function () {
  'use strict';

  const DEPTH = 10;

  // ─── Stockfish worker ───────────────────────────────────────────────────────

  let sf      = null;
  let sfReady = false;
  let sfError = null;
  const queue = [];
  let active  = null;   // { resolve, reject, lines[] }

  async function initSF() {
    // Content scripts cannot create Workers directly from chrome-extension:// URLs.
    // Workaround: fetch the script, wrap in a Blob URL (same-origin), use that.
    let blobUrl;
    try {
      const extUrl  = chrome.runtime.getURL('lib/stockfish.js');
      const resp    = await fetch(extUrl);
      const script  = await resp.text();
      const blob    = new Blob([script], { type: 'application/javascript' });
      blobUrl       = URL.createObjectURL(blob);
      sf            = new Worker(blobUrl);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      sfError = e.message;
      emitStatus();
      return;
    }

    sf.onmessage = ({ data: line }) => {
      if (line === 'readyok') { sfReady = true; emitStatus(); flush(); return; }
      if (!active) return;
      active.lines.push(line);
      if (line.startsWith('bestmove')) {
        const result  = parseLines(active.lines);
        const resolve = active.resolve;
        active = null;
        resolve(result);
        flush();
      }
    };

    sf.onerror = (e) => { sfError = e.message || 'unknown'; emitStatus(); };

    sf.postMessage('uci');
    sf.postMessage('setoption name MultiPV value 3');
    sf.postMessage('isready');
  }

  function flush() {
    if (!sfReady || active || queue.length === 0) return;
    const item = queue.shift();
    active = item.task;
    item.commands.forEach(c => sf.postMessage(c));
  }

  function enqueue(commands) {
    return new Promise((resolve, reject) => {
      queue.push({ commands, task: { resolve, reject, lines: [] } });
      flush();
    });
  }

  // ─── UCI output parser ──────────────────────────────────────────────────────

  function tok(line, key) {
    const m = line.match(new RegExp(key + '\\s+(\\S+)'));
    return m ? m[1] : null;
  }

  function parseScore(line) {
    const cp   = line.match(/score cp (-?\d+)/);
    if (cp)   return { type: 'cp',   value: parseInt(cp[1]) };
    const mate = line.match(/score mate (-?\d+)/);
    if (mate) return { type: 'mate', value: parseInt(mate[1]) };
    return { type: 'cp', value: 0 };
  }

  function toFloat(s) {
    if (!s) return 0;
    return s.type === 'mate' ? (s.value > 0 ? 99 : -99)
                             : Math.round(s.value) / 100;
  }

  function parseLines(lines) {
    const pvMap = {};
    for (const line of lines) {
      if (!line.startsWith('info')) continue;
      const pv    = parseInt(tok(line, 'multipv')) || 1;
      const depth = parseInt(tok(line, 'depth'))   || 0;
      const score = parseScore(line);
      const moves = (line.match(/ pv (.+)$/) || ['', ''])[1].trim().split(' ');
      if (!pvMap[pv] || depth > pvMap[pv].depth)
        pvMap[pv] = { depth, score, move: moves[0] };
    }
    const best = pvMap[1];
    if (!best) return null;
    return {
      eval:     toFloat(best.score),
      bestMove: best.move || null,
      topMoves: Object.values(pvMap)
        .map(v => ({ move: v.move, score: toFloat(v.score) }))
        .filter(v => v.move),
    };
  }

  // ─── Analysis helpers ───────────────────────────────────────────────────────

  function analyze(fen, depth) {
    if (!sfReady) return Promise.reject(new Error(sfError || 'Stockfish not ready'));
    return enqueue([`position fen ${fen}`, `go depth ${depth}`]);
  }

  function classify(delta) {
    if (delta < 0.3) return 'ok';
    if (delta < 0.9) return 'inaccuracy';
    if (delta < 2.0) return 'mistake';
    return 'blunder';
  }

  async function checkCandidate(fen, sanMove, depth) {
    if (typeof Chess === 'undefined') throw new Error('chess.js not loaded');
    const base = await analyze(fen, depth);
    if (!base) throw new Error('Base analysis failed');

    const chess = new Chess(fen);
    if (!chess.move(sanMove)) throw new Error('Illegal move: ' + sanMove);

    const after = await analyze(chess.fen(), depth);
    if (!after) throw new Error('Post-move analysis failed');

    const candidateEval = -after.eval;
    const delta = base.eval - candidateEval;
    return {
      move:           sanMove,
      bestMove:       base.bestMove,
      bestEval:       base.eval,
      candidateEval,
      delta:          Math.round(delta * 100) / 100,
      classification: classify(delta),
    };
  }

  // ─── Event interface ────────────────────────────────────────────────────────

  function emit(type, detail) {
    document.dispatchEvent(new CustomEvent(type, { detail }));
  }

  function emitStatus() {
    emit('ct:engine-status', {
      status: sfReady ? 'ready' : sfError ? 'error' : 'initializing',
      error: sfError,
    });
  }

  document.addEventListener('ct:position', ({ detail }) => {
    analyze(detail.fen, DEPTH)
      .then(result => emit('ct:analysis', { ...result, fen: detail.fen }))
      .catch(err  => emit('ct:analysis', { error: err.message }));
  });

  document.addEventListener('ct:check-candidate', ({ detail }) => {
    checkCandidate(detail.fen, detail.move, DEPTH)
      .then(result => emit('ct:candidate-result', result))
      .catch(err  => emit('ct:candidate-result', { error: err.message }));
  });

  document.addEventListener('ct:ping', emitStatus);

  // ─── Boot ───────────────────────────────────────────────────────────────────

  initSF();

})();
