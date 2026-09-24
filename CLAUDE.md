# Note per Claude

- **Lingua:** parla sempre in italiano con l'utente, anche nei messaggi intermedi mentre lavori.
- **Chi sono:** Niccolò & Beatrice, gli sposi. Il matrimonio è **sabato 17 aprile 2027** (fuso Europe/Rome; l'orario non è ancora indicato).
- **Il loro sito attuale:** `www.17aprile2027.it` (dominio loro) rimanda al sito Joy https://withjoy.com/niccolo-beatrice-2027. Le pagine sono protette da password: pubblicamente si leggono solo il testo di benvenuto e i titoli. Contiene:
  - pagina «Il momento del sì»: la cerimonia; il luogo non si legge senza password;
  - pagina «Dopo il sì»: il ricevimento a **Palazzo Brancaccio**, Viale del Monte Oppio 7, Roma;
  - RSVP entro il **28 febbraio**;
  - pagina «Un pensiero per noi»: lista nozze, con illustrazione di casa e viaggio.
- **Il loro stile (tema Joy «Cobalt Glaze»):** bianco e blu cobalto `#3d518a`, nomi in corsivo Italianno, disegni a inchiostro blu della chiesa e di Palazzo Brancaccio, monogramma NB. Nell'app: colore `cobalto`, «Stile dei nomi: corsivo», copertina chiara.
- **Attenzione:** `17aprile.it` NON è loro; era un errore di battitura.
- **Il progetto:** l'app del loro matrimonio (PWA). Info prima delle nozze, svelamento dei tavoli con notifica ed email, bacheca live con chat e foto, «Regia» per gli sposi. Dettagli nel `README.md`.
- **Stato:** codice completo e testato (`npm test`). Deve ancora andare online su Render tramite `render.yaml`: il deploy lo fanno gli sposi con il link nel README. Consiglio dato: andare online verso gennaio–febbraio 2027. L'app potrà usare il loro dominio: `www.17aprile2027.it` al posto di Joy, oppure un sottodominio. Da decidere con loro. Se l'app sostituisce Joy, serve aggiungere l'RSVP all'app.
- **Anteprima interattiva:** `node scripts/build-demo.mjs` genera `demo/dist/`, pubblicata come Artifact su https://claude.ai/artifact/NZez7XRnfGFV2MNQoLMxHk. Le illustrazioni degli sposi vengono scaricate in `demo/assets/`, che non va nel repository pubblico. Dopo ogni modifica all'app, ricostruiscila e ripubblicala.
- **Repository GitHub pubblico:** non caricarci foto o dati personali degli sposi oltre a quelli già pubblici sul loro sito.
- **Preferenza dell'utente:** vuole il massimo risultato con il minimo sforzo e il minor numero di domande possibile.
