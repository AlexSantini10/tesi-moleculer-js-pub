# Info

## Directory
- side_services: contiene il docker-compose per il database MongoDB e per i servizi principali
- medaryon: contiene il codice sorgente del progetto Medaryon
- tesi: contiene i dati di documentazione e le risorse per la tesi

## Avvio del Progetto
Per avviare il progetto, eseguire i seguenti comandi:
- entra nella directory `database`:
```bash
cd database
```
- avvia il database MongoDB e i servizi principali:
```bash
docker-compose up -d
```
- entra nella directory `medaryon`:
```bash
cd ../medaryon
```
- installa le dipendenze del progetto:
```bash
npm install
```
- avvia il servizio Medaryon:
```bash
npm start
```
- per avviare il servizio di test, eseguire:
```bash
npm run test
```

# Documentazione API
http://localhost:3000/api/openapi.yaml