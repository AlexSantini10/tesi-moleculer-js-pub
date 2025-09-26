"use strict";

/**
 * Pagamento fallito → avvisa l'utente.
 * payload.metadata = { userId?, payerId?, reason?, appointmentId? }
 */
module.exports = async function(payload) {
	try {
		const md = payload && payload.metadata ? payload.metadata : {};
		const userId = Number(md.userId || md.payerId || 0);
		if (!userId) return;

		let msg = null;
		if (md.reason) {
			// messaggio personalizzato
			msg = "Pagamento non riuscito: " + String(md.reason);
		} else {
			msg = "Pagamento non riuscito. Riprova.";
		}

		await this.actions.queue({
			user_id: userId,
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
				trigger: "payments.payment.failed",
				user_id: userId,
				reason: md.reason || null
			}
		});
	} catch (err) {
		this.logger.warn("payments.payment.failed notify failed", { err: err && err.message });
	}
};
