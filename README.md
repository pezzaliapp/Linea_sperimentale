## Installazione come PWA
1. Mantieni `manifest.json` e `sw.js` nella root.
2. Pubblica la cartella su un hosting statico (GitHub Pages, Netlify, Vercel, qualunque server HTTPS).
3. Apri la pagina dal telefono e **Aggiungi alla schermata Home**.

## Icone
- **icon-192.png** — 192×192 px, PNG
- **icon-512.png** — 512×512 px, PNG  
Sono in bianco/nero con tratto continuo. Puoi sostituirle con altre mantenendo nome e formato.

## Come funziona (breve)
- La baseline scorre verso sinistra.
- Un generatore crea **step**, **gap** (buchi) e **bump** (gobbe).
- Collisione semplice contro la forma corrente della linea; cadere in un **gap** o urtare male termina la partita.
- Difficoltà progressiva: la velocità aumenta col tempo.

## Personalizzazioni
Apri `app.js` e modifica:
- `speed` (velocità iniziale)
- frequenza ostacoli (`t % 70`)
- stile del personaggio (funzione `guy.draw()`)

## Costruzione/Deploy
- **GitHub Pages:** crea un repo, carica i file nella branch `main`, poi `Settings → Pages → Deploy from branch`.
- **Server tuo:** copia i file in una cartella servita via HTTPS. Niente build step richiesto.

## Licenza
Codice rilasciato con **MIT License**.  
Il progetto è un **tributo artistico**: nomi e marchi appartengono ai rispettivi titolari.

© 2025 pezzaliAPP
