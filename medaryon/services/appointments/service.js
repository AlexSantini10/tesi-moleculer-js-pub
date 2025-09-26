"use strict";

const { Sequelize, DataTypes, Op } = require("sequelize");
const { Errors } = require("moleculer");
const AppointmentModel = require("./models/Appointment.model.js");

// event handlers che appointments ascolta
const onUserDeleted = require("./events/users.user.deleted");
const onSlotDeleted = require("./events/availability.slot.deleted");
const onSlotUpdated = require("./events/availability.slot.updated");
const onPaymentCompleted = require("./events/payments.payment.completed");
const onPaymentFailed = require("./events/payments.payment.failed");

const { MoleculerClientError, MoleculerError } = Errors;

// importa oggetti azione
const actCreate = require("./actions/create");
const actGet = require("./actions/get");
const actUpdate = require("./actions/update");
const actReschedule = require("./actions/reschedule");
const actSetStatus = require("./actions/setStatus");
const actDelete = require("./actions/delete");
const actRemove = require("./actions/remove");
const actListByUser = require("./actions/listByUser");
const actListByDoctor = require("./actions/listByDoctor");
const actListUpcoming = require("./actions/listUpcoming");
const actListPast = require("./actions/listPast");

module.exports = {
	name: "appointments",

	settings: {
		rest: "/appointments",
		autoAliases: true,
		openapi: { tags: ["Appointments"] }
	},

	actions: {
		create: { rest: "POST /", ...actCreate },
		get: { rest: "GET /:id", ...actGet },
		update: { rest: "PUT /:id", ...actUpdate },
		reschedule: { rest: "PUT /:id/reschedule", ...actReschedule },
		setStatus: { rest: "PUT /:id/status", ...actSetStatus },
		delete: { rest: "DELETE /:id", ...actDelete }, // soft delete
		remove: { rest: "DELETE /:id/hard", ...actRemove }, // hard delete
		listByUser: { rest: "GET /user/:userId", ...actListByUser },
		listByDoctor: { rest: "GET /doctor/:doctorId", ...actListByDoctor },
		listUpcoming: { rest: "GET /upcoming", ...actListUpcoming },
		listPast: { rest: "GET /past", ...actListPast }
	},

	events: {
		"users.user.deleted": onUserDeleted,
		"availability.slot.deleted": onSlotDeleted,
		"availability.slot.updated": onSlotUpdated,
		"payments.payment.completed": onPaymentCompleted,
		"payments.payment.failed": onPaymentFailed
	},

	methods: {
		getRequester(ctx) {
			return ctx && ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		},

		isAdmin(ctx) {
			const u = this.getRequester(ctx);
			return !!u && u.role === "admin";
		},
		isDoctor(ctx) {
			const u = this.getRequester(ctx);
			return !!u && u.role === "doctor";
		},
		isPatient(ctx) {
			const u = this.getRequester(ctx);
			return !!u && u.role === "patient";
		},

		assert(condition, message, code = 400, type = "BAD_REQUEST", data) {
			if (!condition) {
				throw new MoleculerClientError(message, code, type, data);
			}
		},

		parseISODate(value, fieldName = "scheduled_at") {
			const s = String(value || "").trim();
			const d = new Date(s);
			if (!s || isNaN(d.getTime())) {
				throw new MoleculerClientError(
					"Invalid date for '" + fieldName + "'. Use ISO 8601.",
					422,
					"INVALID_DATE",
					{ field: fieldName, value: value }
				);
			}
			return d;
		},

		ensureFuture(date, fieldName = "scheduled_at") {
			const now = new Date();
			const d = date instanceof Date ? date : new Date(date);
			this.assert(d.getTime() > now.getTime(), fieldName + " must be in the future", 422, "DATE_NOT_IN_FUTURE", { field: fieldName });
		},

		async assertNoConflict(params) {
			const where = {
				doctor_id: params.doctor_id,
				scheduled_at: params.scheduled_at,
				status: { [Op.in]: ["requested", "confirmed"] }
			};
			if (params.excludeId) where.id = { [Op.ne]: params.excludeId };

			const exists = await this.Appointment.findOne({ where });
			this.assert(!exists, "Doctor already has an appointment at this time", 409, "OVERBOOKING", {
				doctor_id: params.doctor_id,
				scheduled_at: params.scheduled_at
			});
		},

		sanitizePayload(payload) {
			if (!payload) return payload;
			const a = payload.dataValues ? payload.toJSON() : payload;
			return {
				id: a.id,
				patient_id: a.patient_id,
				doctor_id: a.doctor_id,
				scheduled_at: a.scheduled_at,
				status: a.status,
				notes: a.notes || null,
				created_at: a.created_at
			};
		},

		canView(ctx, appt) {
			const u = this.getRequester(ctx);
			if (!u) return false;
			if (u.role === "admin") return true;
			if (u.role === "doctor" && Number(u.id) === Number(appt.doctor_id)) return true;
			if (u.role === "patient" && Number(u.id) === Number(appt.patient_id)) return true;
			return false;
		},
		ensureCanView(ctx, appt) {
			this.assert(this.canView(ctx, appt), "Forbidden", 403, "FORBIDDEN");
		},
		canModify(ctx, appt) {
			if (this.isAdmin(ctx)) return true;
			const u = this.getRequester(ctx);
			if (!u) return false;
			if (["completed", "cancelled"].includes(appt.status)) return false;
			if (u.role === "doctor" && Number(u.id) === Number(appt.doctor_id)) return true;
			if (u.role === "patient" && Number(u.id) === Number(appt.patient_id)) return true;
			return false;
		},
		ensureCanModify(ctx, appt) {
			this.assert(this.canModify(ctx, appt), "Forbidden", 403, "FORBIDDEN");
		},

		ensureCanCreate(ctx, ids) {
			const u = this.getRequester(ctx);
			this.assert(u, "Unauthorized", 401, "UNAUTHORIZED");
			if (u.role === "admin") return;
			if (u.role === "patient") {
				this.assert(Number(u.id) === Number(ids.patient_id), "Patients can only create their own appointments", 403, "FORBIDDEN");
				return;
			}
			if (u.role === "doctor") {
				this.assert(Number(u.id) === Number(ids.doctor_id), "Doctors can only create for themselves", 403, "FORBIDDEN");
				return;
			}
			this.assert(false, "Forbidden", 403, "FORBIDDEN");
		},

		ensureStatusTransition(ctx, appt, newStatus) {
			const allowed = {
				requested: ["confirmed", "cancelled"],
				confirmed: ["completed", "cancelled"],
				cancelled: [],
				completed: []
			};
			const next = allowed[appt.status] || [];
			this.assert(next.includes(newStatus), "Illegal status transition '" + appt.status + "' -> '" + newStatus + "'", 422, "ILLEGAL_STATUS_TRANSITION");

			if (newStatus === "confirmed" || newStatus === "completed") {
				this.assert(
					this.isAdmin(ctx) || (this.isDoctor(ctx) && Number(this.getRequester(ctx).id) === Number(appt.doctor_id)),
					"Only doctor or admin can set '" + newStatus + "'",
					403,
					"FORBIDDEN"
				);
			}
			if (newStatus === "cancelled") {
				this.assert(
					this.isAdmin(ctx)
					|| (this.isDoctor(ctx) && Number(this.getRequester(ctx).id) === Number(appt.doctor_id))
					|| (this.isPatient(ctx) && Number(this.getRequester(ctx).id) === Number(appt.patient_id)),
					"Only participants or admin can cancel",
					403,
					"FORBIDDEN"
				);
			}
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
		}
	},

	async created() {
		const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
		if (!DB_USER || !DB_PASSWORD || !DB_HOST || !DB_PORT || !DB_NAME) {
			throw new Error("Missing database configuration in environment variables.");
		}

		const dbUri = "mysql://" + DB_USER + ":" + DB_PASSWORD + "@" + DB_HOST + ":" + DB_PORT + "/" + DB_NAME;
		this.logger.info("Connecting to DB at " + DB_HOST + ":" + DB_PORT + "/" + DB_NAME);

		try {
			this.sequelize = new Sequelize(dbUri, {
				logging: false,
				define: { freezeTableName: true }
			});

			this.Appointment = AppointmentModel(this.sequelize, DataTypes);
			await this.Appointment.sync();

			this.logger.info("Appointment model initialized");
		} catch (err) {
			this.logger.error("Failed to initialize Appointment model:", err.message);
			throw err;
		}
	}
};
