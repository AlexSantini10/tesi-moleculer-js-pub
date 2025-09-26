"use strict";

/**
 * Lo stato dell'appuntamento è cambiato.
 * Se diventa "cancelled", nasconde i referti al paziente.
 *
 * payload.metadata = { appointmentId, fromStatus, toStatus }
 */
module.exports = async function(payload) {
	try {
		const md = payload && payload.metadata ? payload.metadata : null;
		if (!md || !md.appointmentId) return;

		const toStatus = String(md.toStatus || "");
		if (toStatus !== "cancelled") return;

		const apptId = Number(md.appointmentId);

		const [affected] = await this.Report.update(
			{ visible_to_patient: false },
			{ where: { appointment_id: apptId } }
		);

		this.logger.info("appointments.appointment.statusChanged -> hid reports for patient", { appointmentId: apptId, affected });
	} catch (err) {
		this.logger.error("appointments.appointment.statusChanged handler error", { err: err && err.message });
	}
};
