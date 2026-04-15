# Chessable FEN Copy

Tampermonkey-Userscript für [chessable.com](https://www.chessable.com): blendet einen
**„Copy FEN"**-Knopf unten rechts auf der Seite ein, der die aktuelle Brettstellung
als FEN in die Zwischenablage kopiert.

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
2. Unten rechts erscheint ein grüner **„Copy FEN"**-Knopf.
3. Klick → die aktuelle Stellung wird als FEN in die Zwischenablage kopiert.
   - Erfolg: kurz blau **„Copied!"**
   - Kein Brett gefunden: kurz rot **„No board found"** (Debug-Info in der Konsole)

Die kopierte FEN-Zeile lässt sich direkt z.B. in
[lichess.org/analysis](https://lichess.org/analysis) oder
[chess.com/analysis](https://www.chess.com/analysis) einfügen.

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
