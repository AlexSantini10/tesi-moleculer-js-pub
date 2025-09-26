"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	params: {
		id: { type: "number", convert: true, positive: true },
		reason: { type: "string", optional: true, max: 500 }
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
					action: "notifications.notification.fail",
					entity_type: "notification",
					entity_id: id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				this.broker.emit("notifications.notification.notFound", {
					actor,
					action: "notifications.notification.notFound",
					entity_type: "notification",
					entity_id: id,
					status: "error",
					metadata: null
				});
				throw new MoleculerClientError("Notification not found", 404, "NOT_FOUND");
			}

			// idempotenza
			if (n.status === "failed") {
				return { id: n.id, status: n.status };
			}

			n.status = "failed";
			await n.save();

			this.broker.emit("notifications.notification.failed", {
				actor,
				action: "notifications.notification.failed",
				entity_type: "notification",
				entity_id: n.id,
				status: "error",
				metadata: { reason: ctx.params.reason || null, user_id: n.user_id, channel: n.channel }
			});

			return { id: n.id, status: n.status };
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "notifications.notification.fail",
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
			throw this.mapSequelizeError(err, "Failed to mark notification as failed");
		}
	}
};
