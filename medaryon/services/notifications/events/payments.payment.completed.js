"use strict";

/**
 * Pagamento riuscito → avvisa l'utente.
 * payload.metadata = { userId?, payerId?, amount, currency, appointmentId? }
 */
module.exports = async function(payload) {
	try {
		const md = payload && payload.metadata ? payload.metadata : {};
		const userId = Number(md.userId || md.payerId || 0);
		if (!userId) return;

		const amount = md.amount != null ? Number(md.amount) : null;
		const currency = md.currency || "EUR";

		let msg = "Pagamento confermato";
		if (amount != null && !isNaN(amount)) {
			msg += ": " + amount.toFixed(2) + " " + currency;
		}

		await this.actions.queue({
			user_id: userId,
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
				trigger: "payments.payment.completed",
				user_id: userId,
				amount: amount,
				currency: currency
			}
		});
	} catch (err) {
		this.logger.warn("payments.payment.completed notify failed", { err: err && err.message });
	}
};
