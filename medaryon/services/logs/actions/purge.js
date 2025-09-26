"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;
const { Op } = require("sequelize");

module.exports = {
	auth: "required",
	params: {
		before: { type: "string" },
		action: { type: "string", optional: true },
		actor_id: { type: "number", optional: true, convert: true }
	},
	async handler(ctx) {
		const user = ctx && ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		const actorId = user ? user.id : null;
		const actorRole = user ? user.role : "system";

		// solo admin
		if (!this.isAdmin(ctx)) {
			this.broker.emit("logs.record", {
				actor: { id: actorId, role: actorRole },
				action: "logs.purge",
				entity_type: "log",
				entity_id: null,
				status: "error",
				metadata: { reason: "forbidden" }
			});
			throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
		}

		// validazione data
		const before = new Date(ctx.params.before);
		if (isNaN(before.getTime())) {
			this.broker.emit("logs.record", {
				actor: { id: actorId, role: actorRole },
				action: "logs.purge",
				entity_type: "log",
				entity_id: null,
				status: "error",
				metadata: { reason: "invalid_before", value: ctx.params.before }
			});
			throw new MoleculerClientError("Invalid 'before' date", 422, "INVALID_DATE");
		}

		const where = { created_at: { [Op.lt]: before } };
		if (ctx.params.action) where.action = ctx.params.action;
		if (ctx.params.actor_id != null) where.actor_id = ctx.params.actor_id;

		try {
			const deleted = await this.Log.destroy({ where });

			this.broker.emit("logs.record", {
				actor: { id: actorId, role: actorRole },
				action: "logs.purge",
				entity_type: "log",
				entity_id: null,
				status: "ok",
				metadata: {
					before: ctx.params.before,
					filter_action: ctx.params.action || null,
					filter_actor_id: ctx.params.actor_id != null ? ctx.params.actor_id : null,
					deleted
				}
			});

			return { success: true, deleted };
		} catch (err) {
			this.broker.emit("logs.record", {
				actor: { id: actorId, role: actorRole },
				action: "logs.purge",
				entity_type: "log",
				entity_id: null,
				status: "error",
				metadata: { message: err.message, code: err.code ? err.code : null }
			});
			this.logger.error("Purge logs failed", err);
			throw this.mapSequelizeError(err, "Failed to purge logs");
		}
	}
};
