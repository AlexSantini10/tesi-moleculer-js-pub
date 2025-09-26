"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	params: {
		id: { type: "number", integer: true, positive: true, convert: true },
		status: {
			type: "enum",
			values: ["requested", "confirmed", "cancelled", "completed"]
		}
	},

	async handler(ctx) {
		const id = ctx.params.id;
		const targetStatus = ctx.params.status;

		const metaUser = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		const actor = {
			id: metaUser ? metaUser.id : null,
			role: metaUser ? metaUser.role : "system"
		};

		try {
			const appt = await this.Appointment.findByPk(id);
			if (!appt) {
				this.broker.emit("logs.record", {
					actor,
					action: "appointments.appointment.setStatus",
					entity_type: "appointment",
					entity_id: id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				throw new MoleculerClientError("Appointment not found", 404, "NOT_FOUND");
			}

			try {
				this.ensureStatusTransition(ctx, appt, targetStatus);
			} catch (e) {
				if (e instanceof MoleculerClientError) throw e;
				throw new MoleculerClientError(
					e.message || "Invalid status transition",
					409,
					"INVALID_STATUS"
				);
			}

			// idempotenza
			if (appt.status === targetStatus) {
				return this.sanitizePayload(appt);
			}

			// se confermo → controllo slot e futuro
			if (targetStatus === "confirmed") {
				const d =
					appt.scheduled_at instanceof Date
						? appt.scheduled_at
						: new Date(appt.scheduled_at);

				this.ensureFuture(d, "scheduled_at");

				// calcolo parametri compatibili con availability.checkSlot
				const dayOfWeekUtc = d.getUTCDay();
				const start_time = d.toISOString().slice(11, 16); // "HH:MM"
				const endDate = new Date(d.getTime() + 30 * 60000);
				const end_time = endDate.toISOString().slice(11, 16);

				await ctx.call("availability.checkSlot", {
					doctor_id: appt.doctor_id,
					day_of_week: dayOfWeekUtc,
					start_time: start_time,
					end_time: end_time
				});
			}

			const prevStatus = appt.status;
			appt.status = targetStatus;
			await appt.save();

			const scheduledIso =
				appt.scheduled_at && appt.scheduled_at.toISOString
					? appt.scheduled_at.toISOString()
					: String(appt.scheduled_at);

			// evento generico statusChanged
			this.broker.emit("appointments.appointment.statusChanged", {
				actor,
				action: "appointments.appointment.statusChanged",
				entity_type: "appointment",
				entity_id: appt.id,
				status: "ok",
				metadata: {
					from: prevStatus,
					to: targetStatus,
					patient_id: appt.patient_id,
					doctor_id: appt.doctor_id,
					scheduled_at: scheduledIso
				}
			});

			// evento specifico (opzionale, se vuoi granularità)
			this.broker.emit(`appointments.appointment.${targetStatus}`, {
				actor,
				action: `appointments.appointment.${targetStatus}`,
				entity_type: "appointment",
				entity_id: appt.id,
				status: "ok",
				metadata: {
					from: prevStatus,
					to: targetStatus,
					patient_id: appt.patient_id,
					doctor_id: appt.doctor_id,
					scheduled_at: scheduledIso
				}
			});

			// log successo
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.setStatus",
				entity_type: "appointment",
				entity_id: appt.id,
				status: "ok",
				metadata: { from: prevStatus, to: targetStatus }
			});

			return this.sanitizePayload(appt);
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.setStatus",
				entity_type: "appointment",
				entity_id: id,
				status: "error",
				metadata: {
					message: err.message,
					code: err.code || null,
					to: targetStatus
				}
			});
			this.logger.error("Set status failed", err);
			if (err instanceof MoleculerClientError) throw err;
			throw this.mapSequelizeError(err, "Failed to set status");
		}
	}
};
