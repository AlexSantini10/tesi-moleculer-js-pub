"use strict";

/**
 * Nuovo utente → messaggio di benvenuto.
 * payload.metadata = { userId, role }
 */
module.exports = async function(payload) {
	try {
		const md = payload && payload.metadata ? payload.metadata : {};
		const userId = Number(md.userId || 0);
		const role = md.role ? String(md.role) : null;
		if (!userId) {
			this.logger.warn("user.created event missing userId", { metadata: md });
			return;
		}

		let msg = "Benvenuto su Medaryon";
		if (role === "doctor") {
			msg = "Benvenuto su Medaryon! Inizia a gestire le tue disponibilità.";
		} else if (role === "patient") {
			msg = "Benvenuto su Medaryon! Ora puoi prenotare i tuoi appuntamenti.";
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
			metadata: { trigger: "user.created", user_id: userId, role: role }
		});
	} catch (err) {
		this.logger.warn("user.created notify failed", { err: err && err.message });
	}
};
