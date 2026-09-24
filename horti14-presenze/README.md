# 🌿 Presenze Horti 14

L'app con cui i dipendenti di Horti 14 segnalano ogni mese i giorni lavorati, le ferie, i permessi e la malattia. Si apre dal telefono con un link (niente da scaricare dagli store) e si può aggiungere alla schermata Home come un'app.

- **Accesso personale:** ogni dipendente entra con la sua email e una password che sceglie lui. Il titolare non la conosce, quindi ogni dato inserito è attribuito con certezza a quella persona.
- **Inserimento in pochi tocchi:** si sceglie *Lavorato*, *Ferie*, *Permesso* (giornata intera o a ore) o *Malattia* e si toccano i giorni sul calendario. Toccando un giorno si aggiunge una nota, per esempio il numero di protocollo del certificato medico.
- **Conferma del mese:** il dipendente preme «Conferma il mese» e riceve una **ricevuta via email** con il riepilogo, la data e l'ora e le impronte digitali che la certificano.
- **Scadenza: l'ultimo giovedì del mese.** Chi non ha confermato riceve un **promemoria** con una notifica sul telefono e un'email: 3 giorni prima, il giorno della scadenza e ogni giorno nella settimana successiva. Il giorno dopo la scadenza il titolare riceve il **riepilogo di chi manca**.
- **Registro certificato:** ogni modifica viene registrata con data e ora del server, autore, valore prima e dopo, dispositivo e indirizzo IP. Il registro non si può modificare né cancellare, e una verifica automatica segnala qualsiasi manomissione (dettagli più sotto).
- **Per il titolare:** situazione del mese a colpo d'occhio, tabella di tutti i dipendenti giorno per giorno, **file Excel** da mandare al consulente del lavoro, sollecito con un tocco, gestione dei dipendenti.

---

## 1. Metterla online (circa 10 minuti, una volta sola)

L'app gira su **[Render](https://render.com)** e costa circa **7,25 $ al mese** (server più 1 GB di disco per il database). Render fa anche un backup automatico giornaliero del disco.

1. Registrati su Render con **«GitHub»** e autorizza l'accesso a questo repository.
2. Clicca **New › Blueprint**, scegli il repository e alla voce *Blueprint Path* scrivi `horti14-presenze/render.yaml`.
3. Render ti chiede due valori:
   - **ADMIN_EMAIL:** la tua email, per esempio quella di Horti 14. Con questa entri come titolare;
   - **ADMIN_PASSWORD:** una password robusta, solo tua.
4. Aggiungi una carta di pagamento se richiesto e clicca **Deploy Blueprint**. Dopo 3–5 minuti l'app è online a un indirizzo tipo `https://presenze-horti14.onrender.com`.

> **Indirizzo più bello:** in Render › Settings › Custom Domains aggiungi per esempio `presenze.horti14.com`, poi crea il record CNAME che Render ti indica nel pannello del tuo dominio.

<details><summary>Se non trovi il campo «Blueprint Path»</summary>

Crea il servizio a mano con **New › Web Service**: repository questo, *Root Directory* `horti14-presenze`, *Build Command* `npm ci --omit=dev`, *Start Command* `npm start`, piano Starter, regione Frankfurt. In *Advanced* aggiungi un **Disk** montato su `/var/data` (1 GB) e le variabili `DATA_DIR=/var/data`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
</details>

## 2. Configurare (5 minuti)

Apri l'indirizzo dell'app ed entra con ADMIN_EMAIL e ADMIN_PASSWORD.

1. **Impostazioni › Generali:** scrivi il tuo nome (compare nel registro accanto alle tue modifiche) e, se vuoi, cambia l'ora dei promemoria (di norma alle 9:00).
2. **Impostazioni › Email:** con Gmail o Google Workspace:
   - attiva la *verifica in due passaggi* sull'account;
   - apri [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) e crea una password per le app chiamata «Presenze»;
   - incollala nell'app con il tuo indirizzo e premi **Invia email di prova**.
3. **Dipendenti › Aggiungi:** nome, cognome, email ed eventualmente mansione e telefono. Ogni dipendente riceve un'email con il suo **link personale** per scegliere la password. Il link si può mandare anche su **WhatsApp** con un tocco.
4. Sul tuo telefono: **Impostazioni › Notifiche › Attiva**, così ricevi il riepilogo dopo ogni scadenza.

## 3. Come la usano i dipendenti

1. Aprono il link personale, scelgono la password ed entrano. Restano collegati per 6 mesi.
2. Aggiungono l'app alla schermata Home e attivano le notifiche; l'app mostra come fare.
   - **iPhone:** Safari › Condividi › *Aggiungi alla schermata Home*. Apple consente le notifiche solo così, da iOS 16.4 in poi.
   - **Android:** compare direttamente «Attiva le notifiche».
3. Durante il mese scelgono il tipo (Lavorato, Ferie, Permesso, Malattia) e toccano i giorni. I giorni lasciati vuoti valgono come riposo.
4. Entro l'ultimo giovedì premono **Conferma il mese**. I giorni che restano fino a fine mese si inseriscono come da turno. Se poi cambia qualcosa, per esempio una malattia il 30, correggono il giorno e **confermano di nuovo**: tu ricevi una notifica con le differenze.

I dipendenti possono modificare il mese in corso e quello precedente, e segnare in anticipo le ferie dei mesi successivi. I mesi più vecchi sono chiusi: li correggi solo tu, e ogni tua modifica è registrata a tuo nome.

## 4. Ogni mese, per il titolare

- **Mese:** vedi chi ha confermato, chi deve ancora farlo e chi è in ritardo. Con **Sollecita chi manca** mandi subito un promemoria.
- **Tabella:** tutti i dipendenti giorno per giorno. **Excel** scarica il file per il consulente del lavoro, con i totali, lo stato di conferma e le note. **Stampa** produce il foglio presenze in formato A4 orizzontale.
- Toccando un dipendente vedi e correggi il suo calendario e la cronologia delle modifiche.

## 5. Come funziona la certificazione

- Ogni azione diventa un **evento del registro**: giorno segnato o cambiato (con il valore prima e dopo), conferma del mese, accesso, promemoria inviato, modifica di un dipendente. Data e ora sono quelle del **server** (fuso di Roma), non quelle del telefono, quindi nessuno può retrodatare.
- Gli eventi **non si possono modificare né cancellare**: lo impedisce il database stesso.
- Ogni evento contiene l'**impronta digitale SHA-256** del precedente, come gli anelli di una catena. Chi riuscisse ad alterare un evento direttamente nei file romperebbe la catena: in **Registro** la verifica lo segnala indicando l'evento esatto.
- **Prove esterne all'app:** alla conferma il dipendente riceve per email la ricevuta con l'impronta del mese e quella del registro. Tu ricevi l'impronta del registro («sigillo») in ogni riepilogo. Queste email restano nelle caselle di posta, fuori dal server, e dimostrano cosa era registrato in quel momento.
- **Esporta** scarica il registro completo in formato Excel, con entrambe le impronte di ogni evento, verificabile da chiunque.

> **Privacy:** l'app registra solo il tipo di assenza (per la malattia nessuna diagnosi) e non usa la posizione. Consegna ai dipendenti un'informativa sul trattamento dei dati (GDPR, art. 13): il tuo consulente del lavoro può fornirtene una. Il file Excel serve al consulente per le buste paga e non sostituisce il Libro Unico del Lavoro.

---

## Domande frequenti

**Un dipendente ha dimenticato la password?** Tocca «Password dimenticata?» e riceve un link valido un'ora. In alternativa, in *Dipendenti* tocchi il suo nome e poi **Reimposta la password**.

**Hai dimenticato la tua password?** Usa «Password dimenticata?», oppure su Render cambia `ADMIN_PASSWORD`: al riavvio diventa la tua nuova password.

**Un dipendente se ne va?** In *Dipendenti* tocchi **Disattiva account**: non può più entrare, ma le sue presenze e il registro restano.

**Posso avere un altro amministratore, per esempio un responsabile?** Sì: aggiungilo con il ruolo *Titolare*.

**Cosa succede se il server si riavvia?** Niente: i dati sono sul disco e i promemoria già inviati non partono due volte.

---

## Per sviluppatori

Node.js 22 senza passaggio di build: Express, SQLite integrato (`node:sqlite`), Web Push (chiavi VAPID generate in automatico), Nodemailer. Il frontend è una PWA in JavaScript puro (`public/`); le regole del calendario (`public/js/cal.js`) sono condivise da server, app e anteprima.

```bash
npm install
npm run dev      # http://localhost:3000 · titolare@example.com / titolare123 · le email finiscono in data/outbox
npm test         # test end-to-end delle API, dei promemoria e del registro
node scripts/build-demo.mjs   # anteprima interattiva senza server in demo/dist/
```

| Variabile | Uso |
|---|---|
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Account del titolare, creato al primo avvio. Cambiare `ADMIN_PASSWORD` reimposta la password |
| `DATA_DIR` | Cartella persistente del database (default `./data`) |
| `PUBLIC_URL` | Indirizzo pubblico per i link nelle email (su Render è automatico) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Facoltative: email configurate senza passare dalle Impostazioni |

Con Docker: `docker build -t presenze . && docker run -p 3000:3000 -v presenze-dati:/data -e ADMIN_EMAIL=… -e ADMIN_PASSWORD=… presenze`.
