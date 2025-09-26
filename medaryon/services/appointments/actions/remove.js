"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	params: {
		id: { type: "number", integer: true, positive: true, convert: true }
	},

	async handler(ctx) {
		const id = ctx.params.id;

		const actorFromCtx = (fallbackRole) => ({
			id: (ctx.meta && ctx.meta.user && ctx.meta.user.id) ? ctx.meta.user.id : null,
			role: (ctx.meta && ctx.meta.user && ctx.meta.user.role) ? ctx.meta.user.role : fallbackRole
		});

		// solo admin
		if (!this.isAdmin(ctx)) {
			this.broker.emit("logs.record", {
				actor: actorFromCtx("system"),
				action: "appointments.appointment.hardRemove",
				entity_type: "appointment",
				entity_id: id,
				status: "error",
				metadata: { reason: "forbidden" }
			});
			throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
		}

		try {
			const appt = await this.Appointment.findByPk(id);
			if (!appt) {
				this.broker.emit("logs.record", {
					actor: actorFromCtx("system"),
					action: "appointments.appointment.hardRemove",
					entity_type: "appointment",
					entity_id: id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				throw new MoleculerClientError("Appointment not found", 404, "NOT_FOUND");
			}

			const payloadMeta = {
				patient_id: appt.patient_id,
				doctor_id: appt.doctor_id,
				scheduled_at: appt.scheduled_at && appt.scheduled_at.toISOString ? appt.scheduled_at.toISOString() : String(appt.scheduled_at),
				prev_status: appt.status
			};

			await appt.destroy();

			// evento dominio
			this.broker.emit("appointments.appointment.deleted", {
				actor: actorFromCtx("admin"),
				action: "appointments.appointment.deleted",
				entity_type: "appointment",
				entity_id: id,
				status: "ok",
				metadata: payloadMeta
			});

			// log successo
			this.broker.emit("logs.record", {
				actor: actorFromCtx("admin"),
				action: "appointments.appointment.hardRemove",
				entity_type: "appointment",
				entity_id: id,
				status: "ok",
				metadata: payloadMeta
			});

			return { id, removed: true };
		} catch (err) {
			this.broker.emit("logs.record", {
				actor: actorFromCtx("system"),
				action: "appointments.appointment.hardRemove",
				entity_type: "appointment",
				entity_id: id,
				status: "error",
				metadata: { message: err.message, code: err.code || null }
			});
			this.logger.error("Hard remove failed", err);
			if (err instanceof MoleculerClientError) throw err;
			throw this.mapSequelizeError(err, "Failed to remove appointment");
		}
	}
};
