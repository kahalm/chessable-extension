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
2. Auf den folgenden Link klicken — Tampermonkey bietet die Installation an:
   **[chessable-fen-copy.user.js](https://raw.githubusercontent.com/kahalm/chessable-extension/main/chessable-fen-copy.user.js)**

Alternativ: Tampermonkey-Icon → **„Neues Skript erstellen…"**, den Inhalt von
[`chessable-fen-copy.user.js`](./chessable-fen-copy.user.js) einfügen und mit
`Strg`+`S` speichern.

### Auto-Updates

Das Skript enthält `@updateURL` und `@downloadURL` auf `raw.githubusercontent.com`.
Tampermonkey prüft standardmäßig alle 24 h auf Updates und zieht neue Versionen
automatisch. Manuell: Tampermonkey Dashboard → **„Auf Updates prüfen"**.

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

**Primär (Suche innerhalb des aktuellen Kurses):** die Kurs-ID wird aus der
aktuellen URL (`/course/<courseId>/…`) gelesen, `/` im Stellungs-Teil wird
durch `;` ersetzt, der Rest URL-kodiert. Beispiel:

```
FEN: r1b1k1nr/p2pp2p/6p1/q1p1b3/8/2N5/PPPQ1BPP/R3KB1R w KQkq - 0 14
URL: https://www.chessable.com/course/228856/fen/r1b1k1nr;p2pp2p;6p1;q1p1b3;8;2N5;PPPQ1BPP;R3KB1R%20w%20KQkq%20-%200%2014/
```

**Fallback (globale Suche):** wenn keine Kurs-ID in der URL gefunden wird
(z. B. auf einer Suchseite), wird `/` durch `U` ersetzt und
`https://www.chessable.com/courses/fen/…/` verwendet.

## Wie es funktioniert

Chessable rendert das Brett mit React +
[cm-chessboard](https://github.com/shaack/cm-chessboard). Das Skript versucht
die FEN in zwei Stufen zu ermitteln:

1. **React-Fiber (bevorzugt):** Vom Board-Element (`#board`) wird die React
   Fiber (`__reactFiber$…`) nach oben gelaufen und der erste Vorfahr gesucht,
   dessen Props ein gültiges `interactiveFen` oder `fen` enthalten. Damit sind
   Seitenzug, Rochaderechte, En-passant-Feld sowie Halfmove-/Fullmove-Counter
   korrekt.
2. **DOM-Fallback:** Falls keine React-Props gefunden werden, wird die
   Stellung aus den `[data-square]` / `[data-piece]`-Attributen rekonstruiert
   und der Seitenzug aus dem Text „White/Black to move/play" gelesen. Metadaten
   (Rochade/Ep/Clocks) sind dann Defaults.

Als zusätzlicher Fallback ist auch ein chessground-Parser eingebaut, falls
Chessable die Render-Engine wechselt.

## Limitationen

- **DOM-Fallback** (nur wenn React-Fiber-Zugriff scheitert):
  - Rochaderechte immer `KQkq`.
  - En passant immer `-`.
  - Halfmove-/Fullmove-Counter als Defaults (`0 1`).
- Falls Chessable die React-Props-Namen (`fen`, `interactiveFen`) oder das
  Brett-Markup ändert, greifen die Extraktoren ggf. nicht mehr — dann muss
  `extractFenFromReact` bzw. `CM_PIECE_TO_FEN` im Skript angepasst werden.

## Debugging

Wenn der Knopf „No board found" zeigt, liefert die Browser-Konsole
(F12 → Console) eine Diagnose mit gefundenen Selektoren und einem Beispiel-Piece.
Diese Ausgabe hilft beim Anpassen der Selektoren.

## Lizenz

MIT — siehe Header der `.user.js`-Datei.
