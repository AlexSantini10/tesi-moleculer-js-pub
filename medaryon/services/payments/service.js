"use strict";

const { Sequelize, DataTypes, Op } = require("sequelize");
const { Errors } = require("moleculer");
const PaymentModel = require("./models/Payment.model.js");

// event handlers che payments ascolta
const onApptStatusChanged = require("./events/appointments.appointment.statusChanged");
const onApptDeleted = require("./events/appointments.appointment.deleted");
const onUserDeleted = require("./events/users.user.deleted");

const { MoleculerClientError, MoleculerError } = Errors;

// importa oggetti azione
const actCreate = require("./actions/create");
const actGet = require("./actions/get");
const actList = require("./actions/list");
const actUpdateStatus = require("./actions/updateStatus");
const actMarkPaid = require("./actions/markPaid");
const actRefund = require("./actions/refund");
const actAttachProvider = require("./actions/attachProvider");
const actRemove = require("./actions/remove");

module.exports = {
	name: "payments",

	settings: {
		rest: "/payments",
		autoAliases: true,
		openapi: { tags: ["Payments"] }
	},

	actions: {
		create: { rest: "POST /", ...actCreate },
		get: { rest: "GET /:id", ...actGet },
		list: { rest: "GET /", ...actList },
		updateStatus: { rest: "PUT /:id/status", ...actUpdateStatus },
		markPaid: { rest: "PUT /:id/paid", ...actMarkPaid },
		refund: { rest: "POST /:id/refund", ...actRefund },
		attachProvider: { rest: "PUT /:id/provider", ...actAttachProvider },
		remove: { rest: "DELETE /:id", ...actRemove }
	},

	events: {
		"appointments.appointment.statusChanged": onApptStatusChanged,
		"appointments.appointment.deleted": onApptDeleted,
		"users.user.deleted": onUserDeleted
	},

	methods: {
		getRequester(ctx) {
			return ctx && ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		},

		isAdmin(ctx) {
			const u = this.getRequester(ctx);
			return !!u && u.role === "admin";
		},

		assert(condition, message, code = 400, type = "BAD_REQUEST", data) {
			if (!condition) {
				throw new MoleculerClientError(message, code, type, data);
			}
		},

		parseAmount(v) {
			const s = String(v || "").trim();
			if (!s) {
				throw new MoleculerClientError("amount is required", 422, "VALIDATION_ERROR", { field: "amount" });
			}
			const n = Number(s);
			if (!isFinite(n) || n <= 0) {
				throw new MoleculerClientError("amount must be a positive number", 422, "VALIDATION_ERROR", { field: "amount", value: v });
			}
			return s;
		},

		sanitizeCurrency(c) {
			const s = String((c || "EUR")).toUpperCase();
			return s;
		},

		ensureStatusTransition(current, next) {
			const allowed = {
				pending: ["paid", "failed", "refunded"],
				paid: ["refunded"],
				failed: [],
				refunded: []
			};
			const nexts = allowed[current] || [];
			this.assert(nexts.includes(next), "Illegal status transition '" + current + "' -> '" + next + "'", 422, "ILLEGAL_STATUS_TRANSITION");
		},

		sanitizePayload(p) {
			if (!p) return p;
			const a = p.dataValues ? p.toJSON() : p;
			return {
				id: a.id,
				user_id: a.user_id,
				appointment_id: a.appointment_id,
				amount: a.amount,
				currency: a.currency,
				method: a.method,
				status: a.status,
				provider: a.provider || null,
				provider_payment_id: a.provider_payment_id || null,
				metadata: a.metadata || null,
				paid_at: a.paid_at || null,
				created_at: a.created_at,
				updated_at: a.updated_at
			};
		},

		mapSequelizeError(err, fallbackMessage) {
			if (!err) return new MoleculerError(fallbackMessage || "Database error", 500, "DB_ERROR");
			const name = err.name || "";
			if (name === "SequelizeUniqueConstraintError" || (err.parent && err.parent.code === "ER_DUP_ENTRY")) {
				return new MoleculerClientError("Conflict", 409, "CONFLICT", { message: err.message });
			}
			if (name === "SequelizeValidationError") {
				return new MoleculerClientError("Validation error", 422, "VALIDATION_ERROR", {
					errors: (err.errors || []).map(e => ({ message: e.message, path: e.path, value: e.value }))
				});
			}
			if (name === "SequelizeForeignKeyConstraintError") {
				return new MoleculerClientError("Invalid reference", 400, "FK_CONSTRAINT", { message: err.message });
			}
			if (name.indexOf("SequelizeConnection") === 0) {
				return new MoleculerError("Database unavailable", 503, "DB_UNAVAILABLE");
			}
			return new MoleculerError(fallbackMessage || "Database error", 500, "DB_ERROR", { message: err.message });
		},

		async withTx(work) {
			return this.sequelize.transaction(work);
		},

		safeParseJSON(input) {
			if (input == null) return null;
			if (typeof input === "object") return input;
			try {
				return JSON.parse(String(input));
			} catch (e) {
				return null;
			}
		}
	},

	async created() {
		const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
		this.assert(DB_USER && DB_PASSWORD && DB_HOST && DB_PORT && DB_NAME, "Missing database configuration in environment variables.", 500, "CONFIG_ERROR");

		const dbUri = "mysql://" + DB_USER + ":" + DB_PASSWORD + "@" + DB_HOST + ":" + DB_PORT + "/" + DB_NAME;
		this.logger.info("Connecting to DB at " + DB_HOST + ":" + DB_PORT + "/" + DB_NAME);

		this.sequelize = new Sequelize(dbUri, {
			logging: false,
			define: { freezeTableName: true }
		});

		this.Payment = PaymentModel(this.sequelize, DataTypes);
		await this.Payment.sync();

		this.logger.info("Payment model initialized");
	}
};
