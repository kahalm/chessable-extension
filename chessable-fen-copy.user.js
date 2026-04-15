// ==UserScript==
// @name         Chessable FEN Copy
// @namespace    https://github.com/cpamap/chessable-fen-copy
// @version      0.3.0
// @description  Fügt einen Knopf hinzu, der die aktuelle Brettstellung auf Chessable als FEN in die Zwischenablage kopiert.
// @author       you
// @match        https://www.chessable.com/*
// @match        https://chessable.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ---------- FEN extraction ----------
    //
    // Chessable uses cm-chessboard. Each square is a div with
    // `data-square="a8"` and contains a child div with `data-piece="bR"`
    // (color in lowercase: w/b, role in uppercase: K Q R B N P).
    // We also keep a chessground fallback in case Chessable changes engines.

    // cm-chessboard data-piece -> FEN char
    const CM_PIECE_TO_FEN = {
        wK: 'K', wQ: 'Q', wR: 'R', wB: 'B', wN: 'N', wP: 'P',
        bK: 'k', bQ: 'q', bR: 'r', bB: 'b', bN: 'n', bP: 'p',
    };

    // chessground "white king" etc. -> FEN char (legacy fallback)
    const CG_PIECE_TO_FEN = {
        'white king':   'K', 'white queen':  'Q', 'white rook':   'R',
        'white bishop': 'B', 'white knight': 'N', 'white pawn':   'P',
        'black king':   'k', 'black queen':  'q', 'black rook':   'r',
        'black bishop': 'b', 'black knight': 'n', 'black pawn':   'p',
    };

    function debugDump() {
        const cmSquares = document.querySelectorAll('[data-square]');
        const cmPieces  = document.querySelectorAll('[data-piece]');
        const cgBoard   = document.querySelector('cg-board, .cg-board, [class*="cg-board"]');
        console.log('[Chessable FEN Copy] debug:', {
            url: location.href,
            cmSquaresFound: cmSquares.length,
            cmPiecesFound:  cmPieces.length,
            firstCmPiece: cmPieces[0]
                ? { piece: cmPieces[0].getAttribute('data-piece'),
                    parentSquare: cmPieces[0].closest('[data-square]')?.getAttribute('data-square') }
                : null,
            cgBoardFound: !!cgBoard,
        });
    }

    // ---- cm-chessboard extraction (Chessable) ----

    function extractBoardCm() {
        const squares = document.querySelectorAll('[data-square]');
        if (!squares.length) return null;

        const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
        let sawAnyPiece = false;

        for (const sq of squares) {
            const name = sq.getAttribute('data-square');
            if (!name || name.length !== 2) continue;
            const file = name.charCodeAt(0) - 'a'.charCodeAt(0); // 0..7
            const rank = parseInt(name[1], 10) - 1;              // 0..7
            if (file < 0 || file > 7 || rank < 0 || rank > 7) continue;

            const pieceEl = sq.querySelector('[data-piece]');
            if (!pieceEl) continue;
            const piece = pieceEl.getAttribute('data-piece');
            const fenChar = CM_PIECE_TO_FEN[piece];
            if (!fenChar) continue;

            // grid row 0 = rank 8 (top), row 7 = rank 1 (bottom)
            grid[7 - rank][file] = fenChar;
            sawAnyPiece = true;
        }

        if (!sawAnyPiece) return null;
        return placementFromGrid(grid);
    }

    // ---- chessground extraction (legacy fallback) ----

    function parseTranslate(style) {
        const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(style);
        if (!m) return null;
        return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    }

    function extractBoardCg() {
        const board = document.querySelector('cg-board, .cg-board, [class*="cg-board"]');
        if (!board) return null;

        const rect = board.getBoundingClientRect();
        const sq = rect.width / 8;
        if (!sq || !isFinite(sq)) return null;

        const wrap = document.querySelector('.cg-wrap, cg-container, [class*="cg-wrap"]');
        let orientation = 'white';
        for (let p = wrap; p; p = p.parentElement) {
            if (p.classList?.contains('orientation-black')) { orientation = 'black'; break; }
            if (p.classList?.contains('orientation-white')) { orientation = 'white'; break; }
        }

        const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
        const pieces = board.querySelectorAll('piece');
        if (!pieces.length) return null;

        for (const p of pieces) {
            if (p.classList.contains('ghost') || p.classList.contains('fading')) continue;
            const cls = Array.from(p.classList);
            const color = cls.find(c => c === 'white' || c === 'black');
            const role  = cls.find(c => ['king','queen','rook','bishop','knight','pawn'].includes(c));
            if (!color || !role) continue;
            const fenChar = CG_PIECE_TO_FEN[`${color} ${role}`];
            if (!fenChar) continue;

            const t = parseTranslate(p.style.transform || p.getAttribute('style') || '');
            if (!t) continue;

            const colIdx = Math.round(t.x / sq);
            const rowIdx = Math.round(t.y / sq);
            if (colIdx < 0 || colIdx > 7 || rowIdx < 0 || rowIdx > 7) continue;

            const file = orientation === 'white' ? colIdx : 7 - colIdx;
            const rank = orientation === 'white' ? 7 - rowIdx : rowIdx;
            grid[7 - rank][file] = fenChar;
        }

        return placementFromGrid(grid);
    }

    function placementFromGrid(grid) {
        const rows = grid.map(row => {
            let s = '', empty = 0;
            for (const c of row) {
                if (c === null) empty++;
                else {
                    if (empty) { s += empty; empty = 0; }
                    s += c;
                }
            }
            if (empty) s += empty;
            return s;
        });
        return rows.join('/');
    }

    function extractBoard() {
        return extractBoardCm() || extractBoardCg();
    }

    function detectSideToMove() {
        // Best-effort: look for "Black/White to move/play" in visible text.
        const txt = document.body.innerText || '';
        if (/black\s+to\s+(?:move|play)/i.test(txt)) return 'b';
        if (/white\s+to\s+(?:move|play)/i.test(txt)) return 'w';
        return null;
    }

    function buildFEN() {
        const placement = extractBoard();
        if (!placement) return null;

        const stm = detectSideToMove() || 'w';
        // We don't have reliable info on castling / ep / clocks from the DOM.
        // Use sensible defaults.
        return `${placement} ${stm} KQkq - 0 1`;
    }

    // ---------- Clipboard ----------

    function copyToClipboard(text) {
        if (typeof GM_setClipboard === 'function') {
            try { GM_setClipboard(text, 'text'); return true; } catch (e) { /* fallthrough */ }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
            return true;
        }
        return fallbackCopy(text);
    }

    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        return ok;
    }

    // ---------- UI ----------

    const BTN_ID = 'chessable-fen-copy-btn';

    function createButton() {
        if (document.getElementById(BTN_ID)) return;

        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.type = 'button';
        btn.textContent = 'Copy FEN';
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            zIndex: '2147483647',
            padding: '8px 12px',
            fontSize: '13px',
            fontFamily: 'system-ui, sans-serif',
            background: '#2e7d32',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            opacity: '0.9',
        });

        btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
        btn.addEventListener('mouseleave', () => btn.style.opacity = '0.9');

        btn.addEventListener('click', () => {
            const fen = buildFEN();
            if (!fen) {
                flash(btn, 'No board found', '#c62828');
                debugDump();
                return;
            }
            const ok = copyToClipboard(fen);
            if (ok) {
                flash(btn, 'Copied!', '#1565c0');
                console.log('[Chessable FEN Copy]', fen);
            } else {
                flash(btn, 'Copy failed', '#c62828');
                console.log('[Chessable FEN Copy] FEN (manual copy):', fen);
            }
        });

        document.body.appendChild(btn);
    }

    function flash(btn, text, color) {
        const oldText = btn.textContent;
        const oldBg = btn.style.background;
        btn.textContent = text;
        btn.style.background = color;
        setTimeout(() => {
            btn.textContent = oldText;
            btn.style.background = oldBg;
        }, 1200);
    }

    // Always show the button on chessable.com; clicking will tell the user
    // if no board is found (and dump debug info to the console).
    function ensureButton() {
        createButton();
    }

    if (document.body) ensureButton();
    else document.addEventListener('DOMContentLoaded', ensureButton, { once: true });

    // Keep it alive across SPA navigations.
    const mo = new MutationObserver(() => {
        if (!document.getElementById(BTN_ID)) ensureButton();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
})();
