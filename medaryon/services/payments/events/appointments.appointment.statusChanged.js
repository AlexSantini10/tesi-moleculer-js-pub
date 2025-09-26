"use strict";

const { Op } = require("sequelize");

/**
 * Cambio stato appuntamento.
 * - Se l'appuntamento passa a "cancelled": fallisce i pagamenti ancora "pending".
 * - Non effettua refund automatici (li gestisci via action dédiée).
 *
 * payload.metadata = { appointmentId, fromStatus, toStatus }
 */
module.exports = async function (payload) {
	try {
		const md = payload && payload.metadata ? payload.metadata : null;
		if (!md || !md.appointmentId) return;

		const to = String(md.toStatus || "");
		if (to !== "cancelled") return;

		const apptId = Number(md.appointmentId);

		const [affected] = await this.Payment.update(
			{ status: "failed" },
			{
				where: {
					appointment_id: apptId,
					status: { [Op.eq]: "pending" }
				}
			}
		);

		if (affected > 0) {
			this.broker.emit("payments.payment.failed", {
				action: "appointments.appointment.statusChanged",
				entity_type: "payment",
				entity_id: null,
				status: "error",
				metadata: {
					appointment_id: apptId,
					from: md.fromStatus || null,
					to: md.toStatus || null,
					affected
				}
			});
		}

		this.logger.info("appointments.appointment.statusChanged -> failed pending payments", {
			appointmentId: apptId,
			affected
		});
	} catch (err) {
		this.logger.error("appointments.appointment.statusChanged handler error", { err: err && err.message });
	}
};
