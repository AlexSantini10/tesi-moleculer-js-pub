"use strict";

const { Sequelize, DataTypes } = require("sequelize");
const { MoleculerClientError } = require("moleculer").Errors;
const LogModel = require("./models/Log.model.js");

// importa oggetti azione
const actCreate = require("./actions/create.js");
const actGet = require("./actions/get.js");
const actList = require("./actions/list.js");
const actPurge = require("./actions/purge.js");
const actStats = require("./actions/stats.js");

module.exports = {
	name: "logs",

	settings: {
		rest: "/logs",
		autoAliases: true,
		openapi: { tags: ["Logs"] }
	},

	actions: {
		create: { rest: "POST /", ...actCreate },
		get: { rest: "GET /:id", ...actGet },
		list: { rest: "GET /", ...actList },
		purge: { rest: "DELETE /purge", ...actPurge },
		stats: { rest: "GET /stats", ...actStats }
	},

	events: {
		"logs.record": require("./events/record.js")
	},

	methods: {
		getRequester(ctx) {
			return (ctx && ctx.meta && ctx.meta.user) ? ctx.meta.user : null;
		},

		isAdmin(ctx) {
			const u = this.getRequester(ctx);
			return u && u.role === "admin";
		},

		isDoctor(ctx) {
			const u = this.getRequester(ctx);
			return u && u.role === "doctor";
		},

		assert(condition, message, code = 400, type = "BAD_REQUEST", data) {
			if (!condition) {
				throw new MoleculerClientError(message, code, type, data);
			}
		},

		canReadLog(ctx, log) {
			if (this.isAdmin(ctx)) return true;
			const u = this.getRequester(ctx);
			if (!u) return false;
			return Number(log.actor_id) === Number(u.id);
		},

		canWriteForActor(ctx, actorId) {
			if (this.isAdmin(ctx)) return true;
			const u = this.getRequester(ctx);
			if (!u) return false;
			return Number(actorId) === Number(u.id);
		}
	},

	async created() {
		const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;

		this.sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
			host: DB_HOST,
			port: Number(DB_PORT),
			dialect: "mysql",
			logging: false,
			define: { freezeTableName: true },
			timezone: "+00:00",
			pool: {
				max: 5,
				min: 0,
				acquire: 30000,
				idle: 10000
			},
			retry: {
				max: 5,
				match: [
					/SequelizeConnectionError/i,
					/SequelizeConnectionRefusedError/i,
					/SequelizeHostNotFoundError/i,
					/SequelizeHostNotReachableError/i,
					/SequelizeInvalidConnectionError/i,
					/SequelizeConnectionTimedOutError/i,
					/PROTOCOL_CONNECTION_LOST/i
				]
			},
			dialectOptions: {
				connectTimeout: 20000
			}
		});

		this.Log = LogModel(this.sequelize, DataTypes);

		const wait = ms => new Promise(r => setTimeout(r, ms));
		let attempt = 0;
		const maxAttempts = 5;
		while (attempt < maxAttempts) {
			try {
				attempt++;
				this.logger.info("Connecting to DB at " + DB_HOST + ":" + DB_PORT + "/" + DB_NAME + " (attempt " + attempt + ")");
				await this.sequelize.authenticate();
				await this.Log.sync();
				this.logger.info("Logs model initialized");
				break;
			} catch (err) {
				if (attempt >= maxAttempts) {
					this.logger.error("Failed to initialize Logs after retries", err);
					throw err;
				}
				this.logger.warn("DB init failed (" + ((err && (err.code || err.name)) || "unknown") + "). Retrying...");
				await wait(1000 * attempt);
			}
		}
	}
};
