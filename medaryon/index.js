require("dotenv").config();
const { ServiceBroker } = require("moleculer");
const path = require("path");
const fs = require("fs");

const broker = new ServiceBroker({
	// Generare nodeID se non definito via variabile d'ambiente
	nodeID: process.env.NODE_ID || "node-" + Math.random().toString(16).slice(2),

	// Impostare transporter; valore di default per DEV
	transporter: process.env.TRANSPORTER || "nats://localhost:4222",

	// Impostare logger
	logger: process.env.LOGGER || "Console",

	// Livello di log
	logLevel: process.env.LOG_LEVEL || "info",

	// Abilitare cacher in memoria solo se richiesto da variabile d'ambiente
	cacher: process.env.CACHER === "true" ? "Memory" : undefined,

	// Heartbeat
	heartbeatInterval: process.env.HEARTBEAT_INTERVAL ? Number(process.env.HEARTBEAT_INTERVAL) : 5,
	heartbeatTimeout: process.env.HEARTBEAT_TIMEOUT ? Number(process.env.HEARTBEAT_TIMEOUT) : 15,

	// Politica di retry con backoff esponenziale
	retryPolicy: {
		enabled: true,
		retries: 5,
		delay: 100,
		maxDelay: 1000,
		factor: 2,
		check: function (err) {
			return err && !!err.retryable;
		}
	}
});

// Leggere la lista di servizi da avviare su questo nodo
let servicesToLoad = [];
if (process.env.NODE_SERVICES) {
	servicesToLoad = process.env.NODE_SERVICES
		.split(",")
		.map(s => s.trim())
		.filter(s => s.length > 0);
}

// Caricare i servizi specificati, verificando l'esistenza del file
servicesToLoad.forEach(serviceName => {
	const servicePath = path.join(__dirname, "services", serviceName, "service.js");
	if (!fs.existsSync(servicePath)) {
		console.error("File servizio mancante: " + servicePath);
		process.exit(1);
	}
	try {
		broker.loadService(servicePath);
		console.log("Service loaded: " + serviceName);
	} catch (err) {
		console.error("Errore durante il caricamento del servizio \"" + serviceName + "\": " + err.message);
		process.exit(1);
	}
});

// Caricare sempre il gateway
const gatewayPath = path.join(__dirname, "gateway", "service.js");
if (!fs.existsSync(gatewayPath)) {
	console.error("File gateway mancante: " + gatewayPath);
	process.exit(1);
}
try {
	broker.loadService(gatewayPath);
	console.log("Service loaded: gateway");
} catch (err) {
	console.error("Errore durante il caricamento del gateway: " + err.message);
	process.exit(1);
}

// Avviare il broker
broker.start().catch(err => {
	console.error("Avvio broker fallito: " + err.message);
	process.exit(1);
});

// Gestire lo shutdown in modo pulito
function handleShutdown(signal) {
	console.log("Ricevuto " + signal + ". Arresto broker...");
	broker.stop()
		.then(() => {
			console.log("Broker arrestato.");
			process.exit(0);
		})
		.catch(err => {
			console.error("Arresto broker fallito: " + err.message);
			process.exit(1);
		});
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
