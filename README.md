# Medaryon

Medaryon è un progetto sviluppato per dimostrare le potenzialità di **Moleculer.js** nell’ambito delle architetture a microservizi.  
Si tratta di una piattaforma pensata per il dominio **medicale**, che raccoglie in un unico ecosistema diversi servizi: gestione utenti, prenotazione appuntamenti, disponibilità dei dottori, caricamento referti, sistema di notifiche e monitoraggio attività.

L’obiettivo è duplice:
1. Mostrare come Moleculer consenta di creare applicazioni distribuite scalabili e modulari.
2. Produrre un esempio concreto e facilmente estendibile che integri più microservizi con logiche reali di coordinamento.

---

## Architettura generale

Ogni microservizio di Medaryon è indipendente, ma interconnesso tramite il broker di Moleculer.  
Questo consente di avviarli separatamente, ridistribuirli su più nodi e bilanciare il carico in maniera automatica.

L’attivazione dei servizi è gestita tramite **dotenv**: in base alle variabili di ambiente è possibile decidere quali servizi avviare su un nodo specifico.

---

## Servizi implementati

- **users** → gestione degli utenti (registrazione, login, ruoli)  
- **appointments** → prenotazione e gestione degli appuntamenti  
- **availability** → disponibilità e orari dei dottori  
- **reports** → caricamento e accesso ai referti medici  
- **notifications** → invio di notifiche (email, push, logiche custom)  
- **activity-logs** → tracciamento delle operazioni effettuate  
- **gateway** → API gateway che espone i servizi all’esterno  

---

## Struttura delle directory

Ogni servizio ha una propria cartella con questa struttura base:

```text
/nome-servizio
service.js     # definizione principale del servizio Moleculer
actions/       # azioni esposte dal servizio
events/        # eventi ascoltati o emessi
models/        # definizione dei modelli dati
utils/         # funzioni di supporto
```