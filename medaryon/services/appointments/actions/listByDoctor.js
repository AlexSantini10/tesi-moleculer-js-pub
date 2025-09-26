"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	params: {
		doctorId: { type: "number", integer: true, positive: true, convert: true }
	},

	async handler(ctx) {
		const doctorId = Number(ctx.params.doctorId);

		const actorUser = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		const actor = {
			id: actorUser ? actorUser.id : null,
			role: actorUser ? actorUser.role : "system"
		};

		if (!actorUser) {
			this.broker.emit("logs.record", {
				actor: { id: null, role: "system" },
				action: "appointments.appointment.listByDoctor",
				entity_type: "appointment",
				entity_id: null,
				status: "error",
				metadata: { reason: "unauthorized", doctorId }
			});
			throw new MoleculerClientError("Unauthorized", 401, "UNAUTHORIZED");
		}

		if (!this.isAdmin(ctx)) {
			if (!(this.isDoctor(ctx) && Number(actorUser.id) === doctorId)) {
				this.broker.emit("logs.record", {
					actor,
					action: "appointments.appointment.listByDoctor",
					entity_type: "appointment",
					entity_id: null,
					status: "error",
					metadata: { reason: "forbidden", doctorId }
				});
				throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
			}
		}

		try {
			const items = await this.Appointment.findAll({
				where: { doctor_id: doctorId },
				order: [["scheduled_at", "DESC"], ["id", "DESC"]]
			});

			const sanitized = items.map(a => this.sanitizePayload(a));

			// log successo
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.listByDoctor",
				entity_type: "appointment",
				entity_id: null,
				status: "ok",
				metadata: { doctorId, count: sanitized.length }
			});

			return sanitized;
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.listByDoctor",
				entity_type: "appointment",
				entity_id: null,
				status: "error",
				metadata: {
					message: err.message,
					code: err.code ? err.code : null,
					doctorId
				}
			});
			this.logger.error("List appointments by doctor failed", err);
			throw this.mapSequelizeError(err, "Failed to list appointments");
		}
	}
};
