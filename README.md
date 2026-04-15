# Chessable FEN Copy + Search

Tampermonkey-Userscript für [chessable.com](https://www.chessable.com): blendet
unten rechts zwei Knöpfe ein:

- **Copy FEN** — kopiert die aktuelle Brettstellung als FEN in die Zwischenablage.
- **Search FEN** — öffnet die Chessable-FEN-Suche
  (`https://www.chessable.com/courses/fen/...`) für die aktuelle Stellung in
  einem neuen Tab.

## Installation

1. [Tampermonkey](https://www.tampermonkey.net/) im Browser installieren
   (Chrome, Firefox, Edge, …).
2. Tampermonkey-Icon → **„Neues Skript erstellen…"**.
3. Den Inhalt von [`chessable-fen-copy.user.js`](./chessable-fen-copy.user.js)
   einfügen und mit `Strg`+`S` speichern.

Alternativ lässt sich die `.user.js`-Datei direkt im Browser öffnen — Tampermonkey
fängt das Schema ab und bietet die Installation an.

## Benutzung

1. Auf chessable.com eine Trainer- oder Lern-Seite mit Brett öffnen.
2. Unten rechts erscheinen zwei Knöpfe:
   - Grün **„Copy FEN"** → kopiert die FEN in die Zwischenablage.
   - Blau **„Search FEN"** → öffnet die Chessable-FEN-Suche in neuem Tab.
3. Statusmeldungen am Knopf:
   - **„Copied!"** — Kopieren erfolgreich.
   - **„No board found"** — kein Brett im DOM erkannt (Debug-Info in der Konsole).
   - **„Popup blocked"** — der Browser hat den neuen Tab blockiert; ggf. Popups
     für chessable.com erlauben.

Die kopierte FEN-Zeile lässt sich direkt z.B. in
[lichess.org/analysis](https://lichess.org/analysis) oder
[chess.com/analysis](https://www.chess.com/analysis) einfügen.

### Such-URL-Format

Chessable verwendet ein eigenes URL-Format für die FEN-Suche:
`/` im Stellungs-Teil wird durch `U` ersetzt, der Rest URL-kodiert. Beispiel:

```
FEN: 2r1k2r/ppqbbp1p/4p1pQ/n2nP1N1/8/3B4/P2N1PPP/1RB1R1K1 b k - 1 16
URL: https://www.chessable.com/courses/fen/2r1k2rUppqbbp1pU4p1pQUn2nP1N1U8U3B4UP2N1PPPU1RB1R1K1%20b%20k%20-%201%2016/
```

## Wie es funktioniert

Chessable rendert das Brett mit
[cm-chessboard](https://github.com/shaack/cm-chessboard). Jedes Feld trägt ein
`data-square="a8"`-Attribut und enthält ggf. ein Kind mit
`data-piece="bR"` (Farbe `w`/`b`, Figur `K Q R B N P`).

Das Skript:

1. Iteriert über alle `[data-square]`-Elemente und liest deren `[data-piece]`-Kind.
2. Mappt `wK`/`bP`/… auf die FEN-Zeichen (`K`, `p`, …).
3. Versucht aus dem sichtbaren Text „White/Black to move/play" den Seitenzug zu lesen.
4. Setzt den Rest mit Defaults zusammen.

Als Fallback ist auch ein chessground-Parser eingebaut, falls Chessable die
Render-Engine wechselt.

## Limitationen

- **Rochaderechte** werden immer als `KQkq` angegeben — lassen sich aus dem DOM
  nicht zuverlässig ableiten.
- **En passant** wird nicht erkannt (immer `-`).
- **Halfmove- / Fullmove-Counter** sind Defaults (`0 1`).
- Falls Chessable das Brett-Markup ändert (eigene Klassen, Shadow DOM, anderes
  Rendering), greifen die Selektoren ggf. nicht mehr — dann muss
  `getBoardEl()` / `PIECE_TO_FEN` im Skript angepasst werden.

## Debugging

Wenn der Knopf „No board found" zeigt, liefert die Browser-Konsole
(F12 → Console) eine Diagnose mit gefundenen Selektoren und einem Beispiel-Piece.
Diese Ausgabe hilft beim Anpassen der Selektoren.

## Lizenz

MIT — siehe Header der `.user.js`-Datei.
