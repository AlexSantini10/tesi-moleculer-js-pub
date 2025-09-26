"use strict";

const { redact } = require("../utils/redact");

module.exports = {
	async handler(payload, sender, eventName) {
		try {
			const actor = payload && payload.actor ? payload.actor : null;

			const data = {
				actor_id: actor && actor.id ? Number(actor.id) : null,
				actor_role: actor && actor.role ? actor.role : "system",
				action: payload && payload.action ? payload.action : (eventName || "logs.record"),
				entity_type: payload && payload.entity_type ? payload.entity_type : null,
				entity_id: payload && payload.entity_id != null ? Number(payload.entity_id) : null,
				status: payload && payload.status ? payload.status : "ok",
				metadata: redact(payload && payload.metadata ? payload.metadata : null),
				created_at: new Date()
			};

			await this.Log.create(data);
		} catch (err) {
			this.logger.warn("Failed to record log event", { message: err.message, stack: err.stack });
			// opzionale: potresti notificare un evento di errore
			this.broker.emit("logs.record.error", { message: err.message });
		}
	}
};
