"use strict";

module.exports = {
	visibility: "private",

	params: {
		id: { type: "number", positive: true, convert: true }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { id: null, role: "system" };

		const id = ctx.params.id;

		try {
			const n = await this.Notification.findByPk(id);
			if (!n) {
				this.broker.emit("logs.record", {
					actor,
					action: "notifications.notification.fetch",
					entity_type: "notification",
					entity_id: id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				return null;
			}

			if (n.status === "sent") {
				this.broker.emit("notifications.notification.alreadySent", {
					actor,
					action: "notifications.notification.alreadySent",
					entity_type: "notification",
					entity_id: n.id,
					status: "warning",
					metadata: { channel: n.channel, user_id: n.user_id }
				});
				return this.sanitize(n);
			}

			// invio canale
			const result = await this._deliverViaChannel(n);
			const ok = result === true || (result && result.ok);
			const reason = result && result.reason ? result.reason : null;

			if (ok) {
				n.status = "sent";
				n.sent_at = new Date();
				await n.save();

				this.broker.emit("notifications.notification.sent", {
					actor,
					action: "notifications.notification.sent",
					entity_type: "notification",
					entity_id: n.id,
					status: "ok",
					metadata: { channel: n.channel, user_id: n.user_id }
				});
			} else {
				n.status = "failed";
				n.sent_at = null;
				await n.save();

				this.broker.emit("notifications.notification.failed", {
					actor,
					action: "notifications.notification.failed",
					entity_type: "notification",
					entity_id: n.id,
					status: "error",
					metadata: { channel: n.channel, user_id: n.user_id, reason }
				});
			}

			return this.sanitize(n);
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "notifications.notification.process",
				entity_type: "notification",
				entity_id: id,
				status: "error",
				metadata: { message: err.message, code: err.code || null }
			});

			this.broker.emit("notifications.notification.error", {
				actor,
				action: "notifications.notification.error",
				entity_type: "notification",
				entity_id: id,
				status: "error",
				metadata: null
			});

			throw this.mapSequelizeError(err, "Failed to deliver notification");
		}
	}
};
