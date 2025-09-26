const client = require("prom-client");

// Registry globale Prometheus
const register = new client.Registry();

// Metriche di sistema (CPU, memoria, ecc.)
client.collectDefaultMetrics({ register });

/**
 * USERS
 */
const usersRequests = new client.Counter({
	name: "users_requests_total",
	help: "Numero di richieste HTTP relative agli utenti",
	labelNames: ["method", "route", "status"]
});

const usersDuration = new client.Histogram({
	name: "users_request_duration_seconds",
	help: "Durata delle richieste utenti in secondi",
	labelNames: ["method", "route", "status"],
	buckets: [0.1, 0.3, 0.5, 1, 1.5, 2, 5]
});

// Throughput users (req/s)
const usersThroughput = new client.Gauge({
	name: "users_requests_throughput",
	help: "Throughput medio delle richieste utenti (req/s)",
	labelNames: ["method", "route", "status"]
});

// Throughput massimo users
const usersThroughputMax = new client.Gauge({
	name: "users_requests_throughput_max",
	help: "Massimo throughput delle richieste utenti (req/s) dall'avvio"
});

/**
 * AVAILABILITY
 */
const availabilityRequests = new client.Counter({
	name: "availability_requests_total",
	help: "Numero di richieste HTTP relative alle availability",
	labelNames: ["method", "route", "status"]
});

const availabilityDuration = new client.Histogram({
	name: "availability_request_duration_seconds",
	help: "Durata delle richieste availability in secondi",
	labelNames: ["method", "route", "status"],
	buckets: [0.1, 0.3, 0.5, 1, 1.5, 2, 5]
});

// Throughput availability (req/s)
const availabilityThroughput = new client.Gauge({
	name: "availability_requests_throughput",
	help: "Throughput medio delle richieste availability (req/s)",
	labelNames: ["method", "route", "status"]
});

// Throughput massimo availability
const availabilityThroughputMax = new client.Gauge({
	name: "availability_requests_throughput_max",
	help: "Massimo throughput delle richieste availability (req/s) dall'avvio"
});

/**
 * APPOINTMENTS
 */
const appointmentsRequests = new client.Counter({
	name: "appointments_requests_total",
	help: "Numero di richieste HTTP relative agli appointments",
	labelNames: ["method", "route", "status"]
});

const appointmentsDuration = new client.Histogram({
	name: "appointments_request_duration_seconds",
	help: "Durata delle richieste appointments in secondi",
	labelNames: ["method", "route", "status"],
	buckets: [0.1, 0.3, 0.5, 1, 1.5, 2, 5]
});

// Throughput appointments (req/s)
const appointmentsThroughput = new client.Gauge({
	name: "appointments_requests_throughput",
	help: "Throughput medio delle richieste appointments (req/s)",
	labelNames: ["method", "route", "status"]
});

// Throughput massimo appointments
const appointmentsThroughputMax = new client.Gauge({
	name: "appointments_requests_throughput_max",
	help: "Massimo throughput delle richieste appointments (req/s) dall'avvio"
});

/**
 * HELLO WORLD
 */
const helloRequests = new client.Counter({
	name: "hello_requests_total",
	help: "Numero di richieste HTTP relative all'endpoint helloWorld",
	labelNames: ["method", "route", "status"]
});

const helloDuration = new client.Histogram({
	name: "hello_request_duration_seconds",
	help: "Durata delle richieste helloWorld in secondi",
	labelNames: ["method", "route", "status"],
	buckets: [0.01, 0.05, 0.1, 0.2, 0.5]
});

const helloThroughput = new client.Gauge({
	name: "hello_requests_throughput",
	help: "Throughput medio delle richieste helloWorld (req/s)",
	labelNames: ["method", "route", "status"]
});

// Throughput massimo helloWorld
const helloThroughputMax = new client.Gauge({
	name: "hello_requests_throughput_max",
	help: "Massimo throughput delle richieste helloWorld (req/s) dall'avvio"
});

// Registrazione delle metriche
register.registerMetric(usersRequests);
register.registerMetric(usersDuration);
register.registerMetric(usersThroughput);
register.registerMetric(usersThroughputMax);

register.registerMetric(availabilityRequests);
register.registerMetric(availabilityDuration);
register.registerMetric(availabilityThroughput);
register.registerMetric(availabilityThroughputMax);

register.registerMetric(appointmentsRequests);
register.registerMetric(appointmentsDuration);
register.registerMetric(appointmentsThroughput);
register.registerMetric(appointmentsThroughputMax);

register.registerMetric(helloRequests);
register.registerMetric(helloDuration);
register.registerMetric(helloThroughput);
register.registerMetric(helloThroughputMax);

module.exports = {
	register,
	// Users
	usersRequests,
	usersDuration,
	usersThroughput,
	usersThroughputMax,
	// Availability
	availabilityRequests,
	availabilityDuration,
	availabilityThroughput,
	availabilityThroughputMax,
	// Appointments
	appointmentsRequests,
	appointmentsDuration,
	appointmentsThroughput,
	appointmentsThroughputMax,
	// HelloWorld
	helloRequests,
	helloDuration,
	helloThroughput,
	helloThroughputMax
};
