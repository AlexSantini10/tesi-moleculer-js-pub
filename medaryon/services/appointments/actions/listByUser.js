"use strict";

const { Op, fn } = require("sequelize");
const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	params: {
		user_id: { type: "number", integer: true, positive: true, convert: true },
		role: { type: "enum", values: ["patient", "doctor"] }
	},

	async handler(ctx) {
		const user_id = ctx.params.user_id;
		const role = ctx.params.role;

		const metaUser = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		const actor = {
			id: metaUser ? metaUser.id : null,
			role: metaUser ? metaUser.role : "system"
		};

		if (!metaUser) {
			this.broker.emit("logs.record", {
				actor: { id: null, role: "system" },
				action: "appointments.appointment.listPastByUser",
				entity_type: "appointment",
				entity_id: null,
				status: "error",
				metadata: { reason: "unauthorized", user_id, role }
			});
			throw new MoleculerClientError("Unauthorized", 401, "UNAUTHORIZED");
		}

		if (!this.isAdmin(ctx)) {
			if (role === "patient") {
				if (!(this.isPatient(ctx) && Number(metaUser.id) === Number(user_id))) {
					this.broker.emit("logs.record", {
						actor,
						action: "appointments.appointment.listPastByUser",
						entity_type: "appointment",
						entity_id: null,
						status: "error",
						metadata: { reason: "forbidden", user_id, role }
					});
					throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
				}
			} else if (role === "doctor") {
				if (!(this.isDoctor(ctx) && Number(metaUser.id) === Number(user_id))) {
					this.broker.emit("logs.record", {
						actor,
						action: "appointments.appointment.listPastByUser",
						entity_type: "appointment",
						entity_id: null,
						status: "error",
						metadata: { reason: "forbidden", user_id, role }
					});
					throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
				}
			}
		}

		const where = { scheduled_at: { [Op.lt]: fn("NOW") } };
		if (role === "patient") where.patient_id = user_id;
		else where.doctor_id = user_id;

		try {
			const items = await this.Appointment.findAll({
				where,
				order: [["scheduled_at", "DESC"], ["id", "DESC"]]
			});

			const sanitized = items.map(a => this.sanitizePayload(a));

			// log successo
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.listPastByUser",
				entity_type: "appointment",
				entity_id: null,
				status: "ok",
				metadata: { user_id, role, count: sanitized.length }
			});

			return sanitized;
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.listPastByUser",
				entity_type: "appointment",
				entity_id: null,
				status: "error",
				metadata: { message: err.message, code: err.code ? err.code : null, user_id, role }
			});
			this.logger.error("List past appointments by user failed", err);
			throw this.mapSequelizeError(err, "Failed to list past appointments");
		}
	}
};
