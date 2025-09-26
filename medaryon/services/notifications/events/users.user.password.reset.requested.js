"use strict";

/**
 * Richiesta reset password → avvisa utente (es. via email/push).
 * payload.metadata = { userId }
 */
module.exports = async function(payload) {
	try {
		const md = payload && payload.metadata ? payload.metadata : {};
		const userId = Number(md.userId || 0);

		if (!userId) {
			this.logger.warn("password.reset.requested event missing userId", { metadata: md });
			return;
		}

		const msg = "Abbiamo ricevuto una richiesta di reset password. Se non sei stato tu, ignora questo messaggio.";

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
				trigger: "password.reset.requested",
				user_id: userId
			}
		});
	} catch (err) {
		this.logger.warn("password.reset.requested notify failed", { err: err && err.message });
	}
};
