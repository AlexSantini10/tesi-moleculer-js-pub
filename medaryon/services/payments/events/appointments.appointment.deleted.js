"use strict";

const { Op } = require("sequelize");

/**
 * Appuntamento eliminato.
 * - Fallisce i pagamenti ancora "pending".
 * - Non tocca i "paid" (eventuale refund via action).
 *
 * payload.metadata = { appointmentId }
 */
module.exports = async function (payload) {
	try {
		const md = payload && payload.metadata ? payload.metadata : null;
		const apptId = md ? Number(md.appointmentId) : null;
		if (!apptId) return;

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
				action: "appointments.appointment.deleted",
				entity_type: "payment",
				entity_id: null,
				status: "error",
				metadata: {
					appointment_id: apptId,
					affected
				}
			});
		}

		this.logger.info("appointments.appointment.deleted -> failed pending payments", { appointmentId: apptId, affected });
	} catch (err) {
		this.logger.error("appointments.appointment.deleted handler error", { err: err && err.message });
	}
};
