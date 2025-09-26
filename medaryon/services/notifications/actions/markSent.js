"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	visibility: "private",
	params: {
		id: { type: "number", positive: true, convert: true },
		at: { type: "string", optional: true }
	},
	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { id: null, role: "system" };

		const id = ctx.params.id;

		try {
			// validazione data
			let sentAt = ctx.params.at ? new Date(ctx.params.at) : new Date();
			if (isNaN(sentAt.getTime())) {
				throw new MoleculerClientError("Invalid 'at' date", 422, "INVALID_DATE");
			}

			// ricerca riga
			const n = await this.Notification.findByPk(id);
			if (!n) {
				this.broker.emit("logs.record", {
					actor,
					action: "notifications.notification.markSent",
					entity_type: "notification",
					entity_id: id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				throw new MoleculerClientError("Notification not found", 404, "NOT_FOUND");
			}

			// idempotenza
			if (n.status === "sent") {
				return this.sanitize(n);
			}

			// update stato
			n.status = "sent";
			n.sent_at = sentAt;
			await n.save();

			// evento dominio
			this.broker.emit("notifications.notification.sent", {
				actor,
				action: "notifications.notification.sent",
				entity_type: "notification",
				entity_id: n.id,
				status: "ok",
				metadata: {
					user_id: n.user_id,
					channel: n.channel,
					sent_at: n.sent_at
				}
			});

			return this.sanitize(n);
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "notifications.notification.markSent",
				entity_type: "notification",
				entity_id: id || null,
				status: "error",
				metadata: { message: err.message, code: err.code || null }
			});

			this.broker.emit("notifications.notification.error", {
				actor,
				action: "notifications.notification.error",
				entity_type: "notification",
				entity_id: id || null,
				status: "error",
				metadata: null
			});

			throw this.mapSequelizeError(err, "Failed to mark notification as sent");
		}
	}
};
