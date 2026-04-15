// ==UserScript==
// @name         Chessable FEN Copy
// @namespace    https://github.com/cpamap/chessable-fen-copy
// @version      0.1.0
// @description  Fügt einen Knopf hinzu, der die aktuelle Brettstellung auf Chessable als FEN in die Zwischenablage kopiert.
// @author       you
// @match        https://www.chessable.com/*
// @match        https://chessable.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ---------- FEN extraction from chessground DOM ----------

    // chessground piece class -> FEN char
    const PIECE_TO_FEN = {
        'white king':   'K', 'white queen':  'Q', 'white rook':   'R',
        'white bishop': 'B', 'white knight': 'N', 'white pawn':   'P',
        'black king':   'k', 'black queen':  'q', 'black rook':   'r',
        'black bishop': 'b', 'black knight': 'n', 'black pawn':   'p',
    };

    function getBoardEl() {
        // chessground renders into <cg-board> inside <cg-container> inside <.cg-wrap>
        return document.querySelector('cg-board')
            || document.querySelector('.cg-board')
            || null;
    }

    function getWrapEl() {
        return document.querySelector('.cg-wrap')
            || document.querySelector('cg-container')
            || null;
    }

    function getOrientation() {
        const wrap = getWrapEl();
        if (!wrap) return 'white';
        if (wrap.classList.contains('orientation-black')) return 'black';
        // some versions put it on a parent
        let p = wrap.parentElement;
        while (p) {
            if (p.classList && p.classList.contains('orientation-black')) return 'black';
            if (p.classList && p.classList.contains('orientation-white')) return 'white';
            p = p.parentElement;
        }
        return 'white';
    }

    function parseTranslate(style) {
        // matches translate(12px, 34px)
        const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(style);
        if (!m) return null;
        return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    }

    function extractBoard() {
        const board = getBoardEl();
        if (!board) return null;

        const rect = board.getBoundingClientRect();
        const sq = rect.width / 8;
        if (!sq || !isFinite(sq)) return null;

        const orientation = getOrientation();
        const grid = Array.from({ length: 8 }, () => Array(8).fill(null));

        const pieces = board.querySelectorAll('piece');
        if (!pieces.length) return null;

        for (const p of pieces) {
            // skip ghost / dragging artifacts
            if (p.classList.contains('ghost') || p.classList.contains('fading')) continue;

            const cls = Array.from(p.classList);
            // find color+role match
            const color = cls.find(c => c === 'white' || c === 'black');
            const role  = cls.find(c => ['king','queen','rook','bishop','knight','pawn'].includes(c));
            if (!color || !role) continue;

            const fenChar = PIECE_TO_FEN[`${color} ${role}`];
            if (!fenChar) continue;

            const t = parseTranslate(p.style.transform || p.getAttribute('style') || '');
            if (!t) continue;

            // file/rank in display coords (0..7), with (0,0) = top-left of the rendered board
            const colIdx = Math.round(t.x / sq);
            const rowIdx = Math.round(t.y / sq);
            if (colIdx < 0 || colIdx > 7 || rowIdx < 0 || rowIdx > 7) continue;

            // map display coords to actual (file, rank)
            //   orientation white: top-left = a8  -> file = colIdx,    rank = 7 - rowIdx
            //   orientation black: top-left = h1  -> file = 7 - colIdx, rank = rowIdx
            let file, rank;
            if (orientation === 'white') {
                file = colIdx;
                rank = 7 - rowIdx;
            } else {
                file = 7 - colIdx;
                rank = rowIdx;
            }

            // grid index: row 0 = rank 8 (top), row 7 = rank 1 (bottom)
            const gridRow = 7 - rank;
            const gridCol = file;
            grid[gridRow][gridCol] = fenChar;
        }

        // build placement
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

    function detectSideToMove() {
        // Best-effort: look for "Black to move" / "White to move" in visible text.
        const txt = document.body.innerText || '';
        if (/black\s+to\s+move/i.test(txt)) return 'b';
        if (/white\s+to\s+move/i.test(txt)) return 'w';
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

    // The Chessable trainer is a SPA; the board may appear after navigation.
    function ensureButton() {
        if (getBoardEl()) createButton();
    }

    ensureButton();
    const mo = new MutationObserver(() => ensureButton());
    mo.observe(document.documentElement, { childList: true, subtree: true });
})();
