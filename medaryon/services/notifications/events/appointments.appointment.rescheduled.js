"use strict";

/**
 * Appuntamento riprogrammato → avvisa paziente.
 * payload.metadata = { appointmentId, patientId, doctorId, from: {start,end}, to: {start,end} }
 */
module.exports = async function(payload) {
	try {
		const md = payload && payload.metadata ? payload.metadata : {};
		const patientId = Number(md.patientId || 0);

		if (!patientId || !md.to || !md.to.start) {
			this.logger.warn("appointments.rescheduled event missing data", { metadata: md });
			return;
		}

		const msg = "Appuntamento riprogrammato per " + new Date(md.to.start).toLocaleString();

		await this.actions.queue({
			user_id: patientId,
			channel: "inapp",
			message: msg
		});

		// opzionale: audit log
		this.broker.emit("logs.record", {
			actor: { role: "system" },
			action: "notifications.autoCreate",
			entity_type: "notification",
			entity_id: null,
			status: "ok",
			metadata: {
				trigger: "appointment.rescheduled",
				user_id: patientId,
				message: msg
			}
		});
	} catch (err) {
		this.logger.warn("appointments.rescheduled notify failed", { err: err && err.message });
	}
};
