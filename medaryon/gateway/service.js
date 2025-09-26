"use strict";

const ApiGateway = require("moleculer-web");
const jwt = require("jsonwebtoken");
const os = require("os");
const YAML = require("yaml");

const nodesAction = require("./actions/nodes");
const metricsAction = require("./actions/metrics");
const statsAction = require("./actions/stats");
const stressAction = require("./actions/stress");

// Import delle metriche personalizzate
const {
	usersRequests,
	usersDuration,
	availabilityRequests,
	availabilityDuration,
	appointmentsRequests,
	appointmentsDuration,
	usersThroughput,
	usersThroughputMax,
	availabilityThroughput,
	availabilityThroughputMax,
	appointmentsThroughput,
	appointmentsThroughputMax,
	helloRequests,
	helloDuration,
	helloThroughput,
	helloThroughputMax
} = require("./utils/prometheus");

const Errors = require("../errors");

module.exports = {
	name: "gateway",
	mixins: [ApiGateway],
	autoAliases: true,

	created() {
		if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).trim().length === 0) {
			throw new Error("JWT_SECRET mancante: impossibile avviare il gateway senza chiave.");
		}

		// Variabili per tracciare throughput massimo
		this.maxUsersThroughput = 0;
		this.maxAvailabilityThroughput = 0;
		this.maxAppointmentsThroughput = 0;
		this.maxHelloThroughput = 0;

		// Aggiornamento throughput ogni 10 secondi
		this.updateInterval = setInterval(() => {
			const elapsed = process.uptime();

			// users
			const totalUsers = usersRequests.hashMap
				? Object.values(usersRequests.hashMap).reduce((acc, c) => acc + c.value, 0)
				: 0;
			const usersTp = totalUsers / elapsed;
			usersThroughput.set(usersTp);
			if (usersTp > this.maxUsersThroughput) {
				this.maxUsersThroughput = usersTp;
				usersThroughputMax.set(this.maxUsersThroughput);
			}

			// availability
			const totalAvail = availabilityRequests.hashMap
				? Object.values(availabilityRequests.hashMap).reduce((acc, c) => acc + c.value, 0)
				: 0;
			const availTp = totalAvail / elapsed;
			availabilityThroughput.set(availTp);
			if (availTp > this.maxAvailabilityThroughput) {
				this.maxAvailabilityThroughput = availTp;
				availabilityThroughputMax.set(this.maxAvailabilityThroughput);
			}

			// appointments
			const totalAppt = appointmentsRequests.hashMap
				? Object.values(appointmentsRequests.hashMap).reduce((acc, c) => acc + c.value, 0)
				: 0;
			const apptTp = totalAppt / elapsed;
			appointmentsThroughput.set(apptTp);
			if (apptTp > this.maxAppointmentsThroughput) {
				this.maxAppointmentsThroughput = apptTp;
				appointmentsThroughputMax.set(this.maxAppointmentsThroughput);
			}

			// hello
			const totalHello = helloRequests.hashMap
				? Object.values(helloRequests.hashMap).reduce((acc, c) => acc + c.value, 0)
				: 0;
			const helloTp = totalHello / elapsed;
			helloThroughput.set(helloTp);
			if (helloTp > this.maxHelloThroughput) {
				this.maxHelloThroughput = helloTp;
				helloThroughputMax.set(this.maxHelloThroughput);
			}
		}, 10000);
	},

	stopped() {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
		}
	},

	settings: {
		routes: [{
			path: "/api",
			mappingPolicy: "all",
			cors: true,
			authentication: true,
			authorization: false,

			autoAliases: true,
			whitelist: ["**"],

			aliases: {
				"GET /metrics": "gateway.metrics",
				"GET /nodes": "gateway.nodes",
				"GET /stats": "gateway.stats",

				// Hello world test
				"GET /hello": "gateway.helloWorld",

				// OpenAPI
				"GET /openapi.json": "openapi.generateDocs",
				"GET /docs": "openapi.ui",
				"GET /openapi.yaml": "gateway.openapiYaml",
				"GET /openapi/assets/:file": "openapi.assets",
				"GET /openapi/oauth2-redirect.html": "openapi.oauth2Redirect"
			},

			/**
			 * Middleware che registra metriche per dominio (users, availability, appointments, hello)
			 */
			use: [
				async function (req, res, next) {
					let endTimer;
					let labels = {
						method: req.method,
						route: (req.$alias && req.$alias.path) || req.originalUrl || req.url,
						status: null
					};

					// Avvia il timer corretto
					if (req.url.indexOf("/users") !== -1) {
						endTimer = usersDuration.startTimer();
					} else if (req.url.indexOf("/availability") !== -1) {
						endTimer = availabilityDuration.startTimer();
					} else if (req.url.indexOf("/appointments") !== -1) {
						endTimer = appointmentsDuration.startTimer();
					} else if (req.url.indexOf("/hello") !== -1) {
						endTimer = helloDuration.startTimer();
					}

					res.on("finish", function () {
						labels.status = String(res.statusCode);

						if (req.url.indexOf("/users") !== -1) {
							usersRequests.inc(labels);
							if (endTimer) endTimer(labels);
						} else if (req.url.indexOf("/availability") !== -1) {
							availabilityRequests.inc(labels);
							if (endTimer) endTimer(labels);
						} else if (req.url.indexOf("/appointments") !== -1) {
							appointmentsRequests.inc(labels);
							if (endTimer) endTimer(labels);
						} else if (req.url.indexOf("/hello") !== -1) {
							helloRequests.inc(labels);
							if (endTimer) endTimer(labels);
						}
					});

					next();
				}
			]
		}]
	},

	actions: {
		nodes: nodesAction,
		metrics: metricsAction,
		stats: statsAction,
		stress: stressAction,

		// Action HelloWorld
		helloWorld: {
			rest: {
				method: "GET",
				path: "/hello"
			},
			async handler() {
				return {
					message: "Hello, world!",
					timestamp: new Date().toISOString()
				};
			}
		},

		openapiYaml: {
			rest: {
				method: "GET",
				path: "/openapi.yaml"
			},
			async handler(ctx) {
				const spec = await ctx.call("openapi.generateDocs");
				const yaml = YAML.stringify(spec);
				ctx.meta.$responseType = "text/yaml; charset=utf-8";
				return yaml;
			}
		}
	},

	methods: {
		async authenticate(ctx, route, req, res) {
			const DEBUG = process.env.DEBUG === "true";

			// Rotte pubbliche
			if (req && req.url) {
				const u = req.url;
				if (
					u === "/api/openapi.json" ||
					u === "/api/openapi.yaml" ||
					u === "/api/docs" ||
					u.indexOf("/api/openapi") === 0 ||
					u === "/api/metrics" ||
					u === "/api/hello"
				) {
					return null;
				}
			}

			const action = req.$endpoint && req.$endpoint.action;
			const actionName = action && action.name;

			const publicActions = new Set([
				"gateway.metrics",
				"gateway.nodes",
				"gateway.stats",
				"gateway.helloWorld",
				"users.register",
				"users.login",
				"users.forgotPassword",
				"users.resetPassword",
				"openapi.generateDocs",
				"openapi.ui",
				"openapi.assets",
				"openapi.oauth2Redirect",
				"gateway.openapiYaml"
			]);

			if (publicActions.has(actionName)) return null;

			const authHeader = req.headers && req.headers["authorization"];
			if (!authHeader || authHeader.indexOf("Bearer ") !== 0) {
				throw Errors.MissingTokenError();
			}

			const token = authHeader.slice(7);
			try {
				const decoded = jwt.verify(token, process.env.JWT_SECRET);
				return {
					id: decoded && decoded.id,
					role: decoded && decoded.role,
					email: decoded && decoded.email
				};
			} catch (err) {
				throw Errors.InvalidTokenError();
			}
		},

		getSystemStats() {
			return {
				uptime: process.uptime(),
				hostname: os.hostname(),
				platform: os.platform(),
				arch: os.arch(),
				cpus: os.cpus().length,
				memory: {
					total: os.totalmem(),
					free: os.freemem()
				},
				load: os.loadavg()
			};
		}
	}
};
