"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	params: {
		id: { type: "number", integer: true, positive: true, convert: true }
	},

	async handler(ctx) {
		const id = ctx.params.id;

		const appt = await this.Appointment.findByPk(id);
		if (!appt) {
			throw new MoleculerClientError("Appointment not found", 404, "NOT_FOUND");
		}

		this.ensureCanModify(ctx, appt);

		if (appt.status === "cancelled") {
			return this.sanitizePayload(appt);
		}

		if (appt.status === "completed") {
			throw new MoleculerClientError("Cannot cancel a completed appointment", 409, "INVALID_STATUS");
		}

		const prevStatus = appt.status;
		appt.status = "cancelled";

		const actorUser = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		const actor = {
			id: actorUser ? actorUser.id : null,
			role: actorUser ? actorUser.role : "system"
		};

		try {
			await appt.save();

			const serializedWhen = appt.scheduled_at && appt.scheduled_at.toISOString ? appt.scheduled_at.toISOString() : String(appt.scheduled_at);

			this.broker.emit("appointments.appointment.statusChanged", {
				actor,
				action: "appointments.appointment.statusChanged",
				entity_type: "appointment",
				entity_id: appt && appt.id ? appt.id : null,
				status: "ok",
				metadata: {
					from: prevStatus,
					to: "cancelled",
					patient_id: appt.patient_id,
					doctor_id: appt.doctor_id,
					scheduled_at: serializedWhen
				}
			});

			this.broker.emit("appointments.appointment.cancelled", {
				actor,
				action: "appointments.appointment.cancelled",
				entity_type: "appointment",
				entity_id: appt && appt.id ? appt.id : null,
				status: "ok",
				metadata: {
					patient_id: appt.patient_id,
					doctor_id: appt.doctor_id,
					scheduled_at: serializedWhen
				}
			});

			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.cancel",
				entity_type: "appointment",
				entity_id: appt && appt.id ? appt.id : null,
				status: "ok",
				metadata: {
					patient_id: appt.patient_id,
					doctor_id: appt.doctor_id,
					scheduled_at: serializedWhen
				}
			});

			return this.sanitizePayload(appt);
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.cancel",
				entity_type: "appointment",
				entity_id: id,
				status: "error",
				metadata: {
					message: err.message,
					code: err.code ? err.code : null
				}
			});

			this.logger.error("Cancel appointment failed", err);
			if (err instanceof MoleculerClientError) throw err;
			throw this.mapSequelizeError(err, "Failed to cancel appointment");
		}
	}
};
