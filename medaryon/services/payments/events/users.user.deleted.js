"use strict";

const { Op } = require("sequelize");

/**
 * Utente eliminato/disattivato.
 * - Fallisce i pagamenti "pending" dell'utente.
 * - Non modifica i "paid" o "refunded".
 *
 * payload.metadata = { userId }
 */
module.exports = async function (payload) {
	try {
		const md = payload && payload.metadata ? payload.metadata : null;
		const userId = md ? Number(md.userId) : null;
		if (!userId) return;

		const [affected] = await this.Payment.update(
			{ status: "failed" },
			{
				where: {
					user_id: userId,
					status: { [Op.eq]: "pending" }
				}
			}
		);

		if (affected > 0) {
			this.broker.emit("payments.payment.failed", {
				action: "users.user.deleted",
				entity_type: "payment",
				entity_id: null,
				status: "error",
				metadata: {
					userId,
					affected
				}
			});
		}

		this.logger.info("users.user.deleted -> failed pending payments", { userId, affected });
	} catch (err) {
		this.logger.error("users.user.deleted handler error", { err: err && err.message });
	}
};
