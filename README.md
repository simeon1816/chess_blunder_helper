# Chess Trainer

A Chrome extension that adds a real-time Stockfish analysis sidebar to chess.com and lichess.org.

![sidebar preview](https://raw.githubusercontent.com/placeholder/preview.png)

## Features

- **Eval bar** — always from your perspective, updates after every move
- **Mini board** — click a piece, click its destination to check your planned move
- **Move classification** — Good / Inaccuracy / Mistake / Blunder with exact eval loss
- **chess.com support** — live games, vs computer, puzzles, analysis board, game review
- **lichess support** — analysis board and games
- No external servers — Stockfish runs entirely inside the browser

## Install

### Option A — download the release zip

1. Download the latest release zip from the [Releases](../../releases) page
2. Unzip it
3. In Chrome go to `chrome://extensions`, enable **Developer mode**
4. Click **Load unpacked** → select the unzipped folder

### Option B — clone and build

```bash
git clone https://github.com/your-username/chess-trainer-extension
cd chess-trainer-extension
```

The `lib/` folder already contains the required libraries.
If you need to re-download them, run (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

Then load the folder in Chrome as described above.

## How to use

1. Open any game on chess.com or lichess.org
2. The sidebar appears on the right side of the page
3. The eval bar updates after each move — white side is up, your side is always positive when you're winning
4. To check a move: click a piece on the mini board, then click where you'd move it
   - Green dot = valid quiet move
   - Red border = capture
5. The result shows your move's eval, the engine's best move, and the loss

## Architecture

```
content/chesscom_main.js  ← MAIN world: reads chess.com's board.game API
content/board_watcher.js  ← isolated world: receives FEN, fires ct:position
content/engine.js         ← isolated world: Stockfish Worker, analysis logic
content/sidebar.js        ← isolated world: UI, mini board, event wiring
lib/stockfish.js          ← Stockfish 10 compiled to JS (nmrugg/stockfish.js)
lib/chess.min.js          ← chess.js 0.12 move validation (jhlywa/chess.js)
```

**Why two content scripts for chess.com?**
Chrome extensions run content scripts in an *isolated world* — they cannot read JavaScript properties that the page sets on DOM elements. `chess-board.game` (chess.com's internal game controller) is set by page JavaScript and invisible to normal content scripts. `chesscom_main.js` runs in the page's MAIN world, reads `board.game.getFEN()`, and passes the FEN to the isolated world via a `CustomEvent` on `window`.

**Why a Blob URL for the Stockfish Worker?**
Content scripts cannot create `Worker` instances from `chrome-extension://` URLs directly (same-origin policy). We `fetch()` the script text, wrap it in a `Blob`, and create the Worker from the resulting `blob://` URL.

## Browser compatibility

Requires Chrome 111+ (for `"world": "MAIN"` in Manifest V3 content scripts).

## License

Extension source code: [MIT](LICENSE)
`lib/stockfish.js`: [GPL v3](https://github.com/nmrugg/stockfish.js)
`lib/chess.min.js`: [BSD 2-Clause](https://github.com/jhlywa/chess.js)
