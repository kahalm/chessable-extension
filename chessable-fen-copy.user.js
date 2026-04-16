// ==UserScript==
// @name         Chessable FEN Copy + Search
// @namespace    https://github.com/kahalm/chessable-extension
// @version      0.7.1
// @description  Fügt zwei Knöpfe hinzu: aktuelle Brettstellung als FEN in die Zwischenablage kopieren bzw. auf chessable.com nach Kursen mit dieser Stellung suchen.
// @author       kahalm
// @match        https://www.chessable.com/*
// @match        https://chessable.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @homepageURL  https://github.com/kahalm/chessable-extension
// @supportURL   https://github.com/kahalm/chessable-extension/issues
// @updateURL    https://raw.githubusercontent.com/kahalm/chessable-extension/main/chessable-fen-copy.user.js
// @downloadURL  https://raw.githubusercontent.com/kahalm/chessable-extension/main/chessable-fen-copy.user.js
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
        const fiberFen  = extractFenFromReact();
        const courseId  = currentCourseId();
        console.log('[Chessable FEN Copy] debug:', {
            url: location.href,
            cmSquaresFound: cmSquares.length,
            cmPiecesFound:  cmPieces.length,
            firstCmPiece: cmPieces[0]
                ? { piece: cmPieces[0].getAttribute('data-piece'),
                    parentSquare: cmPieces[0].closest('[data-square]')?.getAttribute('data-square') }
                : null,
            cgBoardFound: !!cgBoard,
            fiberFen,
            courseId,
        });
    }

    // ---- React fiber FEN extraction (preferred) ----
    //
    // Chessable stores the current game state in React props. The board DOM
    // node (`#board` or any element carrying data-square) has an attached
    // React fiber (`__reactFiber$XXX`) whose ancestor fibers carry props
    // like `fen` and `interactiveFen`. Reading those is the only reliable
    // way to get side-to-move / castling / halfmove / fullmove.

    const FEN_REGEX = /^[1-8rnbqkpRNBQKP/]+\s[wb]\s[KQkqA-Ha-h-]+\s(?:[a-h][1-8]|-)\s\d+\s\d+$/;

    function isValidFen(s) {
        return typeof s === 'string' && FEN_REGEX.test(s.trim());
    }

    function getReactFiber(el) {
        if (!el) return null;
        const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
        return key ? el[key] : null;
    }

    function collectFenCandidates(props, out) {
        if (!props || typeof props !== 'object') return;
        // interactiveFen = state after a user move; fen = lesson/base position.
        // Which one matches the displayed board varies per page, so we
        // collect both and pick by DOM match later.
        if (isValidFen(props.interactiveFen)) out.push(props.interactiveFen.trim());
        if (isValidFen(props.fen))            out.push(props.fen.trim());
    }

    function extractFenFromReact() {
        // Start from any element anchored in the board tree.
        const anchor = document.getElementById('board')
            || document.querySelector('[data-square]')?.closest('#board, [class*="chessboard"]')
            || document.querySelector('[data-square]');
        if (!anchor) return null;

        let fiber = getReactFiber(anchor);
        if (!fiber) return null;

        // Collect all FEN candidates from ancestor fibers.
        const candidates = [];
        let depth = 0;
        while (fiber && depth < 40) {
            collectFenCandidates(fiber.memoizedProps, candidates);
            collectFenCandidates(fiber.pendingProps, candidates);
            fiber = fiber.return;
            depth++;
        }
        if (!candidates.length) return null;

        // Prefer a FEN whose placement matches the currently displayed board.
        // This disambiguates between e.g. `fen` (lesson start) and
        // `interactiveFen` (after user move) — whichever actually matches
        // the pieces on screen is the one we want.
        const domPlacement = extractBoardCm();
        if (domPlacement) {
            const matched = candidates.find(c => c.split(' ')[0] === domPlacement);
            if (matched) return matched;
        }

        // No DOM reference or no match: take the first candidate (which
        // prefers interactiveFen over fen from the closest fiber).
        return candidates[0];
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
        // Preferred path: read FEN directly from Chessable's React state.
        // This gives us correct side-to-move, castling, ep, halfmove, fullmove.
        const fiberFen = extractFenFromReact();
        if (fiberFen) return fiberFen;

        // Fallback: reconstruct from DOM (piece placement only; metadata
        // fields are best-effort defaults).
        const placement = extractBoard();
        if (!placement) return null;

        const stm = detectSideToMove() || 'w';
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

    // ---------- Chessable search URL ----------

    function currentCourseId() {
        // 1) URL path: /course/228856/... or /courses/228856/...
        const urlM = /\/courses?\/(\d+)(?:\/|$)/.exec(location.pathname);
        if (urlM) return urlM[1];

        // 2) Any anchor on the page pointing at a course page.
        //    Works on trainer/variation pages which usually link back to
        //    the owning course via a "back" / breadcrumb link.
        for (const a of document.querySelectorAll('a[href*="/course/"]')) {
            const href = a.getAttribute('href') || '';
            const m = /\/course\/(\d+)(?:\/|$)/.exec(href);
            if (m) return m[1];
        }

        // 3) React props near the board: look for courseId / courseID /
        //    course.id on any ancestor fiber.
        const anchor = document.getElementById('board')
            || document.querySelector('[data-square]');
        if (anchor) {
            let fiber = getReactFiber(anchor);
            let depth = 0;
            while (fiber && depth < 60) {
                const id = fiberCourseId(fiber.memoizedProps)
                        || fiberCourseId(fiber.pendingProps);
                if (id) return id;
                fiber = fiber.return;
                depth++;
            }
        }

        return null;
    }

    function fiberCourseId(props) {
        if (!props || typeof props !== 'object') return null;
        const candidates = [
            props.courseId, props.courseID, props.course_id,
            props.course?.id, props.course?.courseId,
        ];
        for (const c of candidates) {
            if (c != null && /^\d+$/.test(String(c))) return String(c);
        }
        return null;
    }

    function chessableSearchUrl(fen) {
        const courseId = currentCourseId();
        if (courseId) {
            // Per-course FEN search: "/" in placement becomes ";" (literal),
            // spaces become %20. All other FEN chars are URL-safe, so we
            // must NOT use encodeURIComponent (it would escape ";" to %3B).
            const encoded = fen.replace(/\//g, ';').replace(/ /g, '%20');
            return `https://www.chessable.com/course/${courseId}/fen/${encoded}/`;
        }
        // Fallback (no course id in URL): global FEN search, "/" -> "U".
        const encoded = fen.replace(/\//g, 'U').replace(/ /g, '%20');
        return `https://www.chessable.com/courses/fen/${encoded}/`;
    }

    // ---------- UI ----------

    const CONTAINER_ID = 'chessable-fen-tools';
    const COPY_BTN_ID  = 'chessable-fen-copy-btn';
    const SEARCH_BTN_ID = 'chessable-fen-search-btn';

    function styleButton(btn, bg) {
        Object.assign(btn.style, {
            padding: '8px 12px',
            fontSize: '13px',
            fontFamily: 'system-ui, sans-serif',
            background: bg,
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            opacity: '0.9',
        });
        btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
        btn.addEventListener('mouseleave', () => btn.style.opacity = '0.9');
    }

    function createUi() {
        if (document.getElementById(CONTAINER_ID)) return;

        const wrap = document.createElement('div');
        wrap.id = CONTAINER_ID;
        Object.assign(wrap.style, {
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            zIndex: '2147483647',
            display: 'flex',
            gap: '8px',
        });

        const copyBtn = document.createElement('button');
        copyBtn.id = COPY_BTN_ID;
        copyBtn.type = 'button';
        copyBtn.textContent = 'Copy FEN';
        styleButton(copyBtn, '#2e7d32');
        copyBtn.addEventListener('click', () => {
            const fen = buildFEN();
            if (!fen) { flash(copyBtn, 'No board found', '#c62828'); debugDump(); return; }
            const ok = copyToClipboard(fen);
            if (ok) {
                flash(copyBtn, 'Copied!', '#1565c0');
                console.log('[Chessable FEN Copy]', fen);
            } else {
                flash(copyBtn, 'Copy failed', '#c62828');
                console.log('[Chessable FEN Copy] FEN (manual copy):', fen);
            }
        });

        const searchBtn = document.createElement('button');
        searchBtn.id = SEARCH_BTN_ID;
        searchBtn.type = 'button';
        searchBtn.textContent = 'Search FEN';
        styleButton(searchBtn, '#1565c0');
        searchBtn.addEventListener('click', () => {
            const fen = buildFEN();
            if (!fen) { flash(searchBtn, 'No board found', '#c62828'); debugDump(); return; }
            const url = chessableSearchUrl(fen);
            console.log('[Chessable FEN Search]', fen, '->', url);
            const win = window.open(url, '_blank', 'noopener');
            if (!win) flash(searchBtn, 'Popup blocked', '#c62828');
        });

        wrap.appendChild(copyBtn);
        wrap.appendChild(searchBtn);
        document.body.appendChild(wrap);
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

    // Always show the buttons on chessable.com; clicking will tell the user
    // if no board is found (and dump debug info to the console).
    function ensureUi() {
        createUi();
    }

    if (document.body) ensureUi();
    else document.addEventListener('DOMContentLoaded', ensureUi, { once: true });

    // Keep the UI alive across SPA navigations.
    const mo = new MutationObserver(() => {
        if (!document.getElementById(CONTAINER_ID)) ensureUi();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
})();
