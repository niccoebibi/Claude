# 💍 L'app del matrimonio

Un'unica app, che gli invitati aprono da un link o da un QR code (nessun App Store da scaricare), per:

- **Prima del matrimonio:** informazioni (cerimonia, ricevimento, programma, dress code, lista nozze, contatti) e conto alla rovescia.
- **Svelamento dei tavoli:** all'ora che scegliete, ogni invitato riceve una **notifica sul telefono** e un'**email** con il suo tavolo, il posto, chi siede con lui e la piantina della sala con il suo tavolo evidenziato.
- **Il gioco degli sposi:** nel profilo di ogni invitato un quiz su di voi, con emoji e coriandoli a ogni risposta giusta, e alcuni effetti speciali in stile videogioco anni '90 (un drago sputafuoco, una pioggia di anelli d'oro, un ballerino, una bamboletta al mare, la campana della borsa, i fulmini, un brindisi, un macellaio, un trattore, un aereo con lo striscione) e altri più eleganti, dorati o rosa (un campanello d'oro, tre medaglie, una gattina DJ, una racchetta, una sveglia, una macchinina, due aeroplanini che disegnano un cuore) che scegliete voi domanda per domanda. Le risposte giuste restano segrete, così nessuno le passa agli altri. Chi lo finisce riceve un **trofeo** accanto al nome (anche nella chat LIVE); chi indovina tutto, il **trofeo brillante**. I **primi 3 in classifica** (più risposte giuste; a pari punti chi ci ha messo meno) vincono un premio: al lancio del bouquet premete «Chiudi la classifica» nella Regia e il podio diventa definitivo.
- **Il giorno del matrimonio:** con un tasto la trasformate nella **chat LIVE**: messaggi e foto in diretta, cuoricini, galleria, annunci degli sposi e uno **schermo per il proiettore**.
- **Dopo:** scaricate tutte le foto e i messaggi in un file .zip.

Tutto si gestisce dalla **Regia**, il pannello degli sposi dentro l'app.

---

## 1. Metterla online (circa 20 minuti, una volta sola)

L'app è **già pronta con i vostri contenuti**: al primo avvio carica da sola il file `config/matrimonio.json`, che contiene:
- nomi, data e ora (17:00), testo di benvenuto;
- le schede della Basilica e di Palazzo Brancaccio, con i parcheggi;
- RSVP entro il 31 gennaio e lista nozze;
- il vostro stile blu cobalto con i nomi in corsivo, e le illustrazioni del vostro sito;
- i 19 tavoli già disposti in sala e lo svelamento alle 18:45 del 17 aprile.

L'app gira su **[Render](https://render.com)**. Costa circa **9,50 $ al mese**: 7 $ per il server più 2,50 $ per 10 GB di spazio per le foto. Nel mese del matrimonio può aggiungersi qualche dollaro di traffico, perché oltre i 5 GB inclusi si pagano 0,15 $/GB. Dopo il matrimonio, scaricate le foto e cancellate il servizio.

### Passo 1 · Rendete privato questo repository (consigliato, 30 secondi)

Il codice contiene luogo e orario del matrimonio. Su GitHub aprite **Settings › General**, scorrete fino a **Danger Zone**, poi **Change visibility › Make private**.

Le domande del **gioco degli sposi** parlano di voi (lavoro, gusti, passioni), quindi finché il repository è pubblico non ci sono: stanno nel file `config/quiz.json`, escluso da GitHub. Quando il repository è privato, chiedete a Claude di aggiungerle; oppure scrivetele voi in **Regia › Il gioco degli sposi**.

### Passo 2 · Mettete online l'app su Render

1. Andate su [dashboard.render.com](https://dashboard.render.com) e registratevi con **«GitHub»**. Quando GitHub lo chiede, date a Render l'accesso a questo repository.
2. Cliccate **New › Blueprint** e scegliete il repository `niccoebibi/Claude`. Se il repository è ancora pubblico funziona anche questo link diretto: [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/niccoebibi/Claude)
3. Render legge da solo la configurazione (`render.yaml`) e vi chiede solo **ADMIN_PASSWORD**: è la password della Regia. Sceglietela voi due e tenetela per voi.
4. Se richiesto, aggiungete una carta di pagamento, poi cliccate **Deploy Blueprint**.
5. Dopo 3–5 minuti l'app è online a un indirizzo tipo `https://matrimonio-xxxx.onrender.com`, che trovate in alto nella pagina del servizio. Apritelo per controllare che ci sia tutto.

### Passo 3 · Collegate www.17aprile2027.it

1. In Render: **Settings › Custom Domains › Add Custom Domain**, scrivete `www.17aprile2027.it` e salvate. Render aggiunge da solo anche `17aprile2027.it`.
2. In Aruba, nell'area clienti, aprite **Gestione domini › 17aprile2027.it**:
   - togliete il **reindirizzamento** (redirect) verso il sito Joy;
   - in **Gestione DNS** aggiungete un record **CNAME**: nome `www`, valore l'indirizzo Render senza `https://` (es. `matrimonio-xxxx.onrender.com`);
   - modificate il record **A** del dominio principale (nome `@` o vuoto) con valore **`216.24.57.1`**;
   - eliminate eventuali record **AAAA**.
3. Entro 10–60 minuti in Render compare **«Verified»** e il certificato HTTPS viene creato da solo. Da quel momento l'app si apre su **www.17aprile2027.it**.

Il sito Joy resta raggiungibile al suo indirizzo `withjoy.com/niccolo-beatrice-2027`: i pulsanti «Conferma (RSVP)» e «Scopri la lista nozze» dell'app portano già lì. La prima volta che entrate nella Regia dal nuovo indirizzo, l'app lo memorizza e lo usa nelle email e nel QR code.

## 2. Le due cose da fare nella Regia

Aprite l'app, toccate **«Area riservata agli sposi»** e inserite la password. I contenuti sono già al loro posto; mancano solo:

1. **Email** (Regia › Email): il modo più semplice è Gmail.
   - Attivate la *verifica in due passaggi* sul vostro account Google.
   - Aprite [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create una password per le app chiamata «Matrimonio» e incollatela nella Regia insieme al vostro indirizzo Gmail.
   - Premete **Invia email di prova**. Con Gmail potete inviare fino a 500 email al giorno.
2. **Invitati** (Regia › Tavoli e invitati):
   - in **Importa** incollate le righe del vostro Excel o Google Fogli (*Nome e cognome · Tavolo · Email · Posto*);
   - oppure, tavolo per tavolo, usate **«Assegna persone»** nella scheda **Tavoli**;
   - quando la wedding planner vi dà la planimetria definitiva, caricatela in **Piantina** e spostate tavoli e ingresso con un tocco.

Poi, da **Condividi**, prendete il link, il **messaggio pronto per WhatsApp** e il **QR code** da stampare.

Quando un invitato si registra con lo stesso nome della vostra lista (anche con nome e cognome invertiti), l'app lo collega da sola al suo tavolo.

## 3. Come la installano gli invitati

Non c'è niente da scaricare dagli store: basta aprire il link o inquadrare il QR code. L'app spiega da sola, passo passo, cosa fare su ogni telefono.

- **Android:** compare il pulsante **«Installa l'app»** e poi **«Attiva le notifiche»**: basta un tocco per ciascuno.
- **iPhone:** si apre il link con Safari e si sceglie *Condividi › Aggiungi alla schermata Home*. Apple permette le notifiche solo dopo questo passaggio (serve iOS 16.4 o successivo). L'app mostra le istruzioni con le icone.
- **Chi non installa o non attiva le notifiche** riceve comunque tutto via **email**. Riceve l'email con il tavolo anche chi non si è mai registrato, se nella lista avete inserito il suo indirizzo: il link nell'email lo fa entrare direttamente.

## 4. Il giorno del matrimonio

- In Regia toccate **Chat LIVE** (oppure programmate l'apertura automatica a un orario). Tutti ricevono una notifica e l'app si trasforma in chat e foto.
- **Annuncio a tutti:** per esempio «Tra 10 minuti il taglio della torta!». Arriva come notifica, compare nell'app e, se volete, anche via email.
- **Schermo per proiettore:** apritelo da un computer collegato a un proiettore o a una TV. Mostra le foto a rotazione, le nuove appena arrivano, i messaggi e il QR code per partecipare.
- Potete eliminare qualsiasi foto o messaggio (icona del cestino), oppure mettere in pausa foto e chat.
- **Lancio del bouquet:** in Regia › Il gioco degli sposi premete «Chiudi la classifica»: il podio di quel momento vince i premi.

### Reggerà 150–170 invitati tutti insieme?

Sì. L'abbiamo provato simulando 170 invitati collegati alla stessa rete nello stesso momento: svelamento dei tavoli, un messaggio a testa nella chat LIVE, 60 foto caricate insieme e tutti che giocano al quiz. Il risultato:
- nessun errore;
- l'avviso dei tavoli arriva a tutti in meno di un decimo di secondo;
- ogni messaggio arriva su tutti i telefoni;
- il server usa meno di 200 MB dei 512 disponibili.

Anche con il doppio degli invitati, 340, non ci sono errori. Per ripetere la prova: `node scripts/load-test.mjs 170`.

Tre accortezze che non dipendono dall'app:
1. **Rete in sala.** È il vero punto debole: nei palazzi storici il segnale del telefono può essere scarso. Chiedete a Palazzo Brancaccio se c'è un Wi-Fi per gli ospiti che regga un centinaio di telefoni, e mettete nome e password del Wi-Fi sui cartoncini con il QR code.
2. **Niente modifiche il giorno delle nozze.** Ogni aggiornamento del codice riavvia l'app per un paio di minuti, perché i dati stanno su un disco e Render non può tenerla accesa durante il riavvio. Fate le ultime modifiche entro qualche giorno prima; per stare tranquilli, su Render mettete *Auto-Deploy* su *Off* nella settimana del matrimonio.
3. **Registrazione a casa.** Mandate il link qualche settimana prima, così quasi tutti arrivano già registrati e con le notifiche attive; la sala serve solo per chat, foto e gioco.

## 5. Dopo il matrimonio

In Regia: **Scarica tutte le foto (.zip)** (foto in alta qualità più un file con tutti i messaggi) ed **Esporta invitati (Excel)**. Render fa anche un backup giornaliero automatico del disco.

---

## Domande frequenti

**Se cambio il tavolo di qualcuno dopo lo svelamento?** Riceve subito una nuova notifica ed email con il tavolo aggiornato.

**Un invitato ha cambiato telefono o non riesce a entrare?** Tocca «Ti sei già registrato? Accedi», scrive la sua email e riceve un codice di 6 cifre.

**Le foto perdono qualità?** Vengono ridimensionate a 2560 pixel sul lato lungo (ottima qualità, caricamento veloce anche con il Wi-Fi della sala).

**Quanti invitati regge?** Senza problemi centinaia di persone collegate insieme.

---

## Per sviluppatori

App Node.js 22 senza passaggio di build: Express, SQLite integrato (`node:sqlite`), Server-Sent Events per il tempo reale, Web Push (chiavi VAPID generate in automatico), Nodemailer. Il frontend è una PWA in JavaScript puro (`public/`).

```bash
npm install
npm run dev      # http://localhost:3000, password Regia: admin; le email finiscono in data/outbox
npm test         # test end-to-end delle API
node scripts/load-test.mjs 170   # prova di carico: 170 invitati tutti insieme
```

| Variabile | Uso |
|---|---|
| `ADMIN_PASSWORD` | Password della Regia (obbligatoria in produzione) |
| `DATA_DIR` | Cartella persistente per database e foto (default `./data`) |
| `PUBLIC_URL` | Indirizzo pubblico, usato nelle email e nel QR (facoltativo: di solito lo riconosce da solo) |
| `SEED_FILE` | Configurazione iniziale da caricare al primo avvio (default `config/matrimonio.json`) |
| `QUIZ_FILE` | Domande del gioco degli sposi, caricate una volta sola (default `config/quiz.json`, escluso da git) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Facoltative: configurano le email senza passare dalla Regia |

Con Docker: `docker build -t matrimonio . && docker run -p 3000:3000 -v matrimonio-dati:/data -e ADMIN_PASSWORD=… matrimonio`.
