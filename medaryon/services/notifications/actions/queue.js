"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	visibility: "private",

	params: {
		user_id: { type: "number", positive: true, convert: true },
		message: { type: "string", empty: false, max: 1000 },
		channel: { type: "string", empty: false, optional: true }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		try {
			// permessi
			if (!this.isAdmin(ctx) && actor.id !== ctx.params.user_id) {
				this.broker.emit("logs.record", {
					actor,
					action: "notifications.notification.create",
					entity_type: "notification",
					entity_id: null,
					status: "error",
					metadata: { reason: "forbidden", target_user: ctx.params.user_id }
				});
				throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
			}

			// normalizzo canale
			const allowedChannels = ["inapp", "email", "sms"];
			const channel = (ctx.params.channel || "inapp").toLowerCase();
			if (!allowedChannels.includes(channel)) {
				throw new MoleculerClientError("Invalid channel", 422, "INVALID_CHANNEL");
			}

			// creazione notifica
			const notif = await this.Notification.create({
				user_id: ctx.params.user_id,
				message: ctx.params.message,
				channel: channel,
				status: "pending",
				created_at: new Date()
			});

			// audit logs
			this.broker.emit("logs.record", {
				actor,
				action: "notifications.notification.create",
				entity_type: "notification",
				entity_id: notif.id,
				status: "ok",
				metadata: { channel }
			});

			// evento dominio
			this.broker.emit("notifications.notification.created", {
				actor,
				action: "notifications.notification.created",
				entity_type: "notification",
				entity_id: notif.id,
				status: "ok",
				metadata: { channel }
			});

			return this.sanitize(notif);
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "notifications.notification.create",
				entity_type: "notification",
				entity_id: null,
				status: "error",
				metadata: { message: err.message, code: err.code || null }
			});

			this.broker.emit("notifications.notification.error", {
				actor,
				action: "notifications.notification.error",
				entity_type: "notification",
				entity_id: null,
				status: "error",
				metadata: null
			});

			throw this.mapSequelizeError ? this.mapSequelizeError(err, "Failed to create notification") : err;
		}
	}
};
