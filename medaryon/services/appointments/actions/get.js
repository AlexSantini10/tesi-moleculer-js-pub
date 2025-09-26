"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	params: {
		id: { type: "number", integer: true, positive: true, convert: true }
	},

	async handler(ctx) {
		const id = ctx.params.id;

		const actorUser = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		const actor = {
			id: actorUser ? actorUser.id : null,
			role: actorUser ? actorUser.role : "system"
		};

		try {
			const appt = await this.Appointment.findByPk(id);
			if (!appt) {
				this.broker.emit("logs.record", {
					actor,
					action: "appointments.appointment.get",
					entity_type: "appointment",
					entity_id: id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				throw new MoleculerClientError("Appointment not found", 404, "NOT_FOUND");
			}

			this.ensureCanView(ctx, appt);

			const sanitized = this.sanitizePayload(appt);

			// log successo
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.get",
				entity_type: "appointment",
				entity_id: sanitized.id || null,
				status: "ok",
				metadata: {
					patient_id: sanitized.patient_id,
					doctor_id: sanitized.doctor_id,
					scheduled_at: sanitized.scheduled_at
				}
			});

			return sanitized;
		} catch (err) {
			if (!(err instanceof MoleculerClientError && err.code === 404)) {
				this.broker.emit("logs.record", {
					actor,
					action: "appointments.appointment.get",
					entity_type: "appointment",
					entity_id: id,
					status: "error",
					metadata: {
						message: err.message,
						code: err.code ? err.code : null
					}
				});
			}
			throw err;
		}
	}
};
