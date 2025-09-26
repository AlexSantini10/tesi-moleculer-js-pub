"use strict";

const { Sequelize, DataTypes } = require("sequelize");
const { Errors } = require("moleculer");
const NotificationModel = require("./models/Notification.model.js");

const onPaymentCompleted = require("./events/payments.payment.completed");
const onPaymentFailed = require("./events/payments.payment.failed");
const onApptStatusChanged = require("./events/appointments.appointment.statusChanged");
const onApptRescheduled = require("./events/appointments.appointment.rescheduled");
const onReportPublished = require("./events/reports.report.published");
const onUserPwdResetRequested = require("./events/users.user.password.reset.requested");
const onUserCreated = require("./events/users.user.created");

const { MoleculerClientError, MoleculerError } = Errors;

// importa oggetti azione
const actQueue = require("./actions/queue");
const actDeliver = require("./actions/deliver");
const actMarkSent = require("./actions/markSent");
const actMarkFailed = require("./actions/markFailed");
const actPrune = require("./actions/prune");

module.exports = {
	name: "notifications",

	settings: {
		rest: "/notifications",
		autoAliases: true,
		openapi: { tags: ["Notifications"] }
	},

	actions: {
		queue: { rest: "POST /", ...actQueue },
		deliver: { rest: "POST /:id/deliver", ...actDeliver },
		markSent: { rest: "PUT /:id/sent", ...actMarkSent },
		markFailed: { rest: "PUT /:id/failed", ...actMarkFailed },
		prune: { rest: "DELETE /prune", ...actPrune }
	},

	events: {
		"payments.payment.completed": onPaymentCompleted,
		"payments.payment.failed": onPaymentFailed,
		"appointments.appointment.statusChanged": onApptStatusChanged,
		"appointments.appointment.rescheduled": onApptRescheduled,
		"reports.report.published": onReportPublished,
		"users.user.password.reset.requested": onUserPwdResetRequested,
		"users.user.created": onUserCreated
	},

	methods: {
		assert(condition, message, code = 400, type = "BAD_REQUEST", data) {
			if (!condition) throw new MoleculerClientError(message, code, type, data);
		},

		sanitize(n) {
			if (!n) return n;
			const a = n.dataValues ? n.toJSON() : n;
			return {
				id: a.id,
				user_id: a.user_id,
				message: a.message,
				channel: a.channel,
				status: a.status,
				sent_at: a.sent_at || null,
				created_at: a.created_at
			};
		},

		mapSequelizeError(err, fallbackMessage) {
			if (!err) return new MoleculerError(fallbackMessage || "DB error", 500, "DB_ERROR");
			const name = err.name || "";
			if (name === "SequelizeValidationError") {
				return new MoleculerClientError("Validation error", 422, "VALIDATION_ERROR", {
					errors: (err.errors || []).map(e => ({ message: e.message, path: e.path, value: e.value }))
				});
			}
			if (name.indexOf("SequelizeConnection") === 0) {
				return new MoleculerError("Database unavailable", 503, "DB_UNAVAILABLE");
			}
			return new MoleculerError(fallbackMessage || "DB error", 500, "DB_ERROR", { message: err.message });
		},

		async _deliverViaChannel(notif) {
			this.logger.info("Delivering notification", { id: notif.id, channel: notif.channel, user_id: notif.user_id });
			return true;
		}
	},

	async created() {
		const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
		this.assert(DB_USER && DB_PASSWORD && DB_HOST && DB_PORT && DB_NAME, "Missing database configuration in environment variables.", 500, "CONFIG_ERROR");

		const dbUri = "mysql://" + DB_USER + ":" + DB_PASSWORD + "@" + DB_HOST + ":" + DB_PORT + "/" + DB_NAME;
		this.logger.info("Connecting to DB at " + DB_HOST + ":" + DB_PORT + "/" + DB_NAME);

		this.sequelize = new Sequelize(dbUri, { logging: false, define: { freezeTableName: true } });

		this.Notification = NotificationModel(this.sequelize, DataTypes);
		await this.Notification.sync();

		this.logger.info("Notification model initialized");
	}
};
