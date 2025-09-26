"use strict";

/**
 * Referto pubblicato → avvisa paziente.
 * payload.metadata = { reportId, appointmentId, patientId }
 */
module.exports = async function(payload) {
	try {
		const md = payload && payload.metadata ? payload.metadata : {};
		const patientId = Number(md.patientId || 0);
		const apptId = md.appointmentId ? Number(md.appointmentId) : null;
		const reportId = md.reportId ? Number(md.reportId) : null;

		if (!patientId || !apptId) {
			this.logger.warn("reports.published event missing data", { metadata: md });
			return;
		}

		const msg = "Nuovo referto disponibile per appuntamento #" + apptId;

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
				trigger: "reports.published",
				user_id: patientId,
				appointment_id: apptId,
				report_id: reportId
			}
		});
	} catch (err) {
		this.logger.warn("reports.published notify failed", { err: err && err.message });
	}
};
