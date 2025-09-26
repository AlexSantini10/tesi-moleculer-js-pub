"use strict";

const { Op } = require("sequelize");

module.exports = async function(payload) {
	try {
		const userId = payload && payload.data ? Number(payload.data.userId) : null;
		if (!userId) return;

		// appuntamenti attivi legati a paziente o dottore
		const where = {
			status: { [Op.in]: ["requested", "confirmed"] },
			[Op.or]: [
				{ patient_id: userId },
				{ doctor_id: userId }
			]
		};

		const appts = await this.Appointment.findAll({ where });
		if (!appts.length) return;

		for (const appt of appts) {
			const prevStatus = appt.status;
			appt.status = "cancelled";

			try {
				await appt.save();

				const scheduledIso = appt.scheduled_at && appt.scheduled_at.toISOString
					? appt.scheduled_at.toISOString()
					: String(appt.scheduled_at);

				// evento dominio
				this.broker.emit("appointments.appointment.statusChanged", {
					actor: { id: null, role: "system" },
					action: "appointments.appointment.statusChanged",
					entity_type: "appointment",
					entity_id: appt.id,
					status: "ok",
					metadata: {
						from: prevStatus,
						to: "cancelled",
						patient_id: appt.patient_id,
						doctor_id: appt.doctor_id,
						scheduled_at: scheduledIso,
						reason: "user_deleted"
					}
				});

				// evento specifico (opzionale)
				this.broker.emit("appointments.appointment.cancelled", {
					actor: { id: null, role: "system" },
					action: "appointments.appointment.cancelled",
					entity_type: "appointment",
					entity_id: appt.id,
					status: "ok",
					metadata: {
						from: prevStatus,
						to: "cancelled",
						patient_id: appt.patient_id,
						doctor_id: appt.doctor_id,
						scheduled_at: scheduledIso,
						reason: "user_deleted"
					}
				});

				// log record
				this.broker.emit("logs.record", {
					actor: { id: null, role: "system" },
					action: "appointments.appointment.cancel",
					entity_type: "appointment",
					entity_id: appt.id,
					status: "ok",
					metadata: {
						from: prevStatus,
						to: "cancelled",
						patient_id: appt.patient_id,
						doctor_id: appt.doctor_id,
						scheduled_at: scheduledIso,
						reason: "user_deleted"
					}
				});
			} catch (e) {
				this.logger.error("Failed to cancel appointment from user.deleted", { id: appt.id, message: e.message });
				this.broker.emit("logs.record", {
					actor: { id: null, role: "system" },
					action: "appointments.appointment.cancel",
					entity_type: "appointment",
					entity_id: appt.id,
					status: "error",
					metadata: { message: e.message }
				});
			}
		}

		this.logger.info("users.user.deleted -> cancelled appointments", { userId, affected: appts.length });
	} catch (err) {
		this.logger.error("users.user.deleted handler error", { message: err && err.message });
	}
};
