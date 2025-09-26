"use strict";

/**
 * L'appuntamento è stato eliminato.
 * Rimuove tutti i referti legati all'appuntamento.
 *
 * payload.metadata = { appointmentId }
 */
module.exports = async function(payload) {
	try {
		const apptId = payload && payload.metadata ? Number(payload.metadata.appointmentId) : null;
		if (!apptId) return;

		const affected = await this.Report.destroy({
			where: { appointment_id: apptId }
		});

		this.logger.info("appointments.appointment.deleted -> removed reports", { appointmentId: apptId, affected });
	} catch (err) {
		this.logger.error("appointments.appointment.deleted handler error", { err: err && err.message });
	}
};
