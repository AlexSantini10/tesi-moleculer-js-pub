"use strict";

const { Op } = require("sequelize");
const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	// opzionale: rest: "POST /notifications/prune",
	auth: "required",
	params: {
		olderThanDays: { type: "number", optional: true, convert: true, integer: true, min: 1 }
	},
	async handler(ctx) {
		// solo admin
		this.assert(this.isAdmin(ctx), "Forbidden", 403, "FORBIDDEN");

		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { id: null, role: "system" };

		try {
			const days = ctx.params.olderThanDays || 30;
			const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

			// prune notifiche inviate più vecchie del cutoff
			const pruned = await this.Notification.destroy({
				where: {
					status: "sent",
					sent_at: { [Op.lt]: cutoff }
				}
			});

			this.broker.emit("notifications.pruned", {
				actor,
				action: "notifications.pruned",
				entity_type: "notification",
				entity_id: null,
				status: "ok",
				metadata: { pruned, olderThanDays: days, cutoff: cutoff.toISOString() }
			});

			return { pruned, olderThanDays: days, cutoff: cutoff.toISOString() };
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "notifications.prune",
				entity_type: "notification",
				entity_id: null,
				status: "error",
				metadata: { message: err.message, code: err.code || null }
			});

			this.broker.emit("notifications.prune.error", {
				actor,
				action: "notifications.prune.error",
				entity_type: "notification",
				entity_id: null,
				status: "error",
				metadata: null
			});

			throw this.mapSequelizeError(err, "Failed to prune notifications");
		}
	}
};
