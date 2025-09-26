"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	params: {
		id: { type: "number", integer: true, positive: true, convert: true },
		new_date: { 
			type: "string",
			pattern: /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/ // ISO 8601 UTC
		}
	},

	async handler(ctx) {
		const id = ctx.params.id;
		const new_date = ctx.params.new_date;

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
					action: "appointments.appointment.reschedule",
					entity_type: "appointment",
					entity_id: id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				throw new MoleculerClientError("Appointment not found", 404, "NOT_FOUND");
			}

			this.ensureCanModify(ctx, appt);

			if (["completed", "cancelled"].includes(appt.status)) {
				this.broker.emit("logs.record", {
					actor,
					action: "appointments.appointment.reschedule",
					entity_type: "appointment",
					entity_id: id,
					status: "error",
					metadata: { reason: "invalid_status", status: appt.status }
				});
				throw new MoleculerClientError(
					"Cannot reschedule a completed or cancelled appointment",
					409,
					"INVALID_STATUS"
				);
			}

			const when = this.parseISODate(new_date, "new_date");
			this.ensureFuture(when, "new_date");

			const prevDateObj =
				appt.scheduled_at instanceof Date
					? appt.scheduled_at
					: new Date(appt.scheduled_at);
			if (!isNaN(prevDateObj.getTime()) && prevDateObj.getTime() === when.getTime()) {
				return this.sanitizePayload(appt);
			}

			// uso UTC coerente
			const dayOfWeekUtc = when.getUTCDay();
			const start_time = when.toISOString().slice(11, 16); // "HH:MM"
			const endDate = new Date(when.getTime() + 30 * 60000);
			const end_time = endDate.toISOString().slice(11, 16);

			await ctx.call("availability.checkSlot", {
				doctor_id: appt.doctor_id,
				day_of_week: dayOfWeekUtc,
				start_time: start_time,
				end_time: end_time
			});

			await this.assertNoConflict({
				doctor_id: appt.doctor_id,
				scheduled_at: when,
				excludeId: appt.id
			});

			const prevDate =
				appt.scheduled_at && appt.scheduled_at.toISOString
					? appt.scheduled_at.toISOString()
					: String(appt.scheduled_at);

			appt.scheduled_at = when;
			await appt.save();

			this.broker.emit("appointments.appointment.rescheduled", {
				actor,
				action: "appointments.appointment.rescheduled",
				entity_type: "appointment",
				entity_id: appt.id,
				status: "ok",
				metadata: {
					from: prevDate,
					to: when.toISOString(),
					patient_id: appt.patient_id,
					doctor_id: appt.doctor_id
				}
			});

			// log successo
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.reschedule",
				entity_type: "appointment",
				entity_id: appt.id,
				status: "ok",
				metadata: {
					from: prevDate,
					to: when.toISOString(),
					patient_id: appt.patient_id,
					doctor_id: appt.doctor_id
				}
			});

			return this.sanitizePayload(appt);
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.reschedule",
				entity_type: "appointment",
				entity_id: id,
				status: "error",
				metadata: { message: err.message, code: err.code || null }
			});
			this.logger.error("Reschedule failed", err);
			if (err instanceof MoleculerClientError) throw err;
			throw this.mapSequelizeError(err, "Failed to reschedule appointment");
		}
	}
};
