"use strict";

module.exports = async function(payload) {
	try {
		const apptId = payload && payload.data ? Number(payload.data.appointmentId) : null;
		if (!apptId) return;

		const appt = await this.Appointment.findByPk(apptId);
		if (!appt || appt.status !== "requested") return;

		const prevStatus = appt.status;
		appt.status = "cancelled";

		try {
			await appt.save();

			const scheduledIso = appt.scheduled_at && appt.scheduled_at.toISOString ? appt.scheduled_at.toISOString() : String(appt.scheduled_at);

			// evento dominio generico
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
					reason: "payment_failed"
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
					reason: "payment_failed"
				}
			});

			// log record
			this.broker.emit("logs.record", {
				actor: { id: null, role: "system" },
				action: "appointments.appointment.setStatus",
				entity_type: "appointment",
				entity_id: appt.id,
				status: "ok",
				metadata: {
					from: prevStatus,
					to: "cancelled",
					patient_id: appt.patient_id,
					doctor_id: appt.doctor_id,
					scheduled_at: scheduledIso,
					reason: "payment_failed"
				}
			});

			this.logger.info("payments.payment.failed -> appointment cancelled", { apptId });
		} catch (e) {
			this.logger.error("Failed to cancel appointment from payment.failed", { id: appt.id, message: e.message });
			this.broker.emit("logs.record", {
				actor: { id: null, role: "system" },
				action: "appointments.appointment.setStatus",
				entity_type: "appointment",
				entity_id: appt.id,
				status: "error",
				metadata: { message: e.message }
			});
		}
	} catch (err) {
		this.logger.error("payments.payment.failed handler error", { message: err && err.message });
	}
};
