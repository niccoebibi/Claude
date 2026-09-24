# Note per Claude: Presenze Horti 14

- **Lingua:** parla sempre in italiano con l'utente.
- **Contesto:** Horti 14 è l'hotel boutique dell'utente a Trastevere, Roma (Via di San Francesco di Sales 14), tema botanico, sito horti14.com. Questa cartella è l'app con cui i dipendenti segnalano le presenze del mese.
- **Richieste dell'utente (settembre 2026):**
  - login personale, così ogni dipendente è identificato con certezza;
  - inserimento semplicissimo dei giorni lavorati, delle ferie, dei permessi e della malattia;
  - ogni modifica registrata e certificata momento per momento;
  - scadenza di consegna: **l'ultimo giovedì del mese**, con promemoria a chi non ha inserito le presenze.
- **Scelte fatte (senza domande, come preferisce l'utente):**
  - password scelta dal dipendente tramite link personale, che il titolare non conosce;
  - codici L/F/P/M, con permesso a ore e note facoltative; i giorni vuoti valgono come riposo;
  - «Conferma il mese» con ricevuta email; una modifica dopo la conferma richiede di riconfermare e avvisa il titolare;
  - promemoria (push più email) 3 giorni prima, il giorno della scadenza e ogni giorno per 7 giorni dopo; riepilogo al titolare il giorno dopo la scadenza;
  - il dipendente modifica solo il mese corrente e il precedente (più i mesi futuri); il titolare modifica tutto;
  - registro append-only con catena SHA-256, protetto da trigger SQLite, con verifica ed export CSV.
- **Stato:** codice completo e testato (`npm test` in questa cartella). Non è ancora online: il deploy su Render lo fa l'utente seguendo il README (Blueprint `horti14-presenze/render.yaml`). Dominio consigliato: `presenze.horti14.com`.
- **Anteprima interattiva:** `node scripts/build-demo.mjs` genera `demo/dist/`, pubblicata come Artifact su https://claude.ai/artifact/SLMTGJVUsTXVX8WxGb6gpP. Dopo ogni modifica all'app ricostruiscila e ripubblicala. Le regole condivise (calendario, testi del registro, CSV) sono in `public/js/` e valgono per server, app e anteprima.
- **Repository GitHub pubblico:** non caricarci nomi, email o dati reali dei dipendenti; nell'anteprima si usano solo persone di esempio.
