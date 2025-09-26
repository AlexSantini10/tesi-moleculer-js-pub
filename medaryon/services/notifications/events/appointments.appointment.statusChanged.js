"use strict";

/**
 * Cambio stato appuntamento → avvisa paziente.
 * payload.metadata = { appointmentId, patientId, doctorId, from, to, scheduled_at }
 */
module.exports = async function(payload) {
	try {
		const md = payload && payload.metadata ? payload.metadata : {};
		const patientId = Number(md.patient_id || md.patientId || 0);
		if (!patientId) return;

		const to = String(md.to || md.toStatus || "");
		let msg = null;

		if (to === "confirmed") {
			const when = md.scheduled_at || md.scheduledAt || null;
			msg = "Appuntamento confermato" + (when ? " per " + new Date(when).toLocaleString() : "");
		} else if (to === "cancelled") {
			msg = "Appuntamento annullato";
		} else if (to === "completed") {
			msg = "Appuntamento completato";
		}

		if (!msg) return;

		await this.actions.queue({
			user_id: patientId,
			channel: "inapp",
			message: msg
		});

		// opzionale: log di audit
		this.broker.emit("logs.record", {
			actor: { role: "system" },
			action: "notifications.autoCreate",
			entity_type: "notification",
			entity_id: null,
			status: "ok",
			metadata: {
				trigger: "appointment.statusChanged",
				user_id: patientId,
				to_status: to,
				message: msg
			}
		});
	} catch (err) {
		this.logger.warn("appointments.statusChanged notify failed", { err: err && err.message });
	}
};
