# 💍 L'app del matrimonio

Un'unica app, che gli invitati aprono da un link o da un QR code (nessun App Store da scaricare), per:

- **Prima del matrimonio:** informazioni (cerimonia, ricevimento, programma, dress code, lista nozze, contatti) e conto alla rovescia.
- **Svelamento dei tavoli:** all'ora che scegliete, ogni invitato riceve una **notifica sul telefono** e un'**email** con il suo tavolo, il posto, chi siede con lui e la piantina della sala con il suo tavolo evidenziato.
- **Il giorno del matrimonio:** con un tasto la trasformate in una **bacheca live**: chat e foto in diretta, cuoricini, galleria, annunci degli sposi e uno **schermo per il proiettore**.
- **Dopo:** scaricate tutte le foto e i messaggi in un file .zip.

Tutto si gestisce dalla **Regia**, il pannello degli sposi dentro l'app.

---

## 1. Metterla online (circa 10 minuti, una volta sola)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/niccoebibi/Claude)

L'app gira su **[Render](https://render.com)**. Costa circa **9,50 $ al mese**: 7 $ per il server più 2,50 $ per 10 GB di spazio per le foto. Nel mese del matrimonio può aggiungersi qualche dollaro di traffico, perché oltre i 5 GB inclusi si pagano 0,15 $/GB. Dopo il matrimonio, scaricate le foto e cancellate il servizio.

1. Cliccate il pulsante **Deploy to Render** qui sopra e registratevi (il modo più rapido è **«GitHub»**).
2. Render legge da solo la configurazione (`render.yaml`) e vi chiede solo **ADMIN_PASSWORD**: è la password della Regia. Sceglietene una robusta e tenetela per voi.
3. Se richiesto, aggiungete una carta di pagamento (il piano con disco per le foto è a pagamento).
4. Cliccate **Deploy Blueprint**. Dopo 3–5 minuti l'app è online a un indirizzo tipo `https://matrimonio-xxxx.onrender.com`: lo trovate in alto nella pagina del servizio.

> Volete un indirizzo più bello (es. `giuliaemarco.it`)? Compratelo su un qualsiasi registrar (circa 10 €/anno) e aggiungetelo in Render › Settings › Custom Domains.

## 2. Configurare l'app dalla Regia

Aprite il link, toccate **«Area riservata agli sposi»** e inserite la password. La Regia vi mostra una lista «Per iniziare» con i 5 passi:

1. **Contenuti e aspetto:** nomi, data, colore, foto di copertina, testi e schede informative. L'icona dell'app con le vostre iniziali viene creata in automatico.
2. **Email:** il modo più semplice è Gmail.
   - Attivate la *verifica in due passaggi* sul vostro account Google.
   - Aprite [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create una password per le app chiamata «Matrimonio» e incollatela nella Regia insieme al vostro indirizzo Gmail.
   - Premete **Invia email di prova**. Con Gmail potete inviare fino a 500 email al giorno.
3. **Tavoli e invitati:** copiate le righe dal vostro Excel o Google Fogli (*Nome e cognome · Tavolo · Email · Posto*) e incollatele in **Importa**. I tavoli si creano da soli. Nella scheda **Piantina** potete caricare la foto della sala e toccare dove si trova ogni tavolo.
4. **Svelamento dei tavoli:** scegliete giorno e ora e premete **Programma**. Con **Anteprima email** vedete in anteprima cosa riceveranno gli invitati.
5. **Condividi:** trovate il link, il **messaggio pronto per WhatsApp** e il **QR code** da stampare sulle partecipazioni o sui segnaposto.

Quando un invitato si registra con lo stesso nome della vostra lista (anche con nome e cognome invertiti), l'app lo collega da sola al suo tavolo.

## 3. Come la installano gli invitati

Non c'è niente da scaricare dagli store: basta aprire il link o inquadrare il QR code. L'app spiega da sola, passo passo, cosa fare su ogni telefono.

- **Android:** compare il pulsante **«Installa l'app»** e poi **«Attiva le notifiche»**: basta un tocco per ciascuno.
- **iPhone:** si apre il link con Safari e si sceglie *Condividi › Aggiungi alla schermata Home*. Apple permette le notifiche solo dopo questo passaggio (serve iOS 16.4 o successivo). L'app mostra le istruzioni con le icone.
- **Chi non installa o non attiva le notifiche** riceve comunque tutto via **email**. Riceve l'email con il tavolo anche chi non si è mai registrato, se nella lista avete inserito il suo indirizzo: il link nell'email lo fa entrare direttamente.

## 4. Il giorno del matrimonio

- In Regia toccate **Bacheca live** (oppure programmate l'apertura automatica a un orario). Tutti ricevono una notifica e l'app si trasforma in chat e foto.
- **Annuncio a tutti:** per esempio «Tra 10 minuti il taglio della torta!». Arriva come notifica, compare nell'app e, se volete, anche via email.
- **Schermo per proiettore:** apritelo da un computer collegato a un proiettore o a una TV. Mostra le foto a rotazione, le nuove appena arrivano, i messaggi e il QR code per partecipare.
- Potete eliminare qualsiasi foto o messaggio (icona del cestino), oppure mettere in pausa foto e chat.

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
```

| Variabile | Uso |
|---|---|
| `ADMIN_PASSWORD` | Password della Regia (obbligatoria in produzione) |
| `DATA_DIR` | Cartella persistente per database e foto (default `./data`) |
| `PUBLIC_URL` | Indirizzo pubblico, usato nelle email e nel QR (su Render è automatico) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Facoltative: configurano le email senza passare dalla Regia |

Con Docker: `docker build -t matrimonio . && docker run -p 3000:3000 -v matrimonio-dati:/data -e ADMIN_PASSWORD=… matrimonio`.
