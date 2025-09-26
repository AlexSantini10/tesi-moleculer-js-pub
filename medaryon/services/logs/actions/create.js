"use strict";

const { redact } = require("../utils/redact");

module.exports = {
	auth: "required",
	params: {
		actor_id: { type: "number", convert: true },
		actor_role: { type: "string", optional: true },
		action: { type: "string" },
		entity_type: { type: "string", optional: true },
		entity_id: { type: "number", optional: true, convert: true },
		status: { type: "string", optional: true, default: "ok" },
		metadata: { type: "any", optional: true }
	},
	async handler(ctx) {
		const actor_id = ctx.params.actor_id;
		const action = ctx.params.action;
		const entity_type = ctx.params.entity_type;
		const entity_id = ctx.params.entity_id;
		const status = ctx.params.status;
		const metadata = ctx.params.metadata;

		// attore da meta: evita spoof
		const actor_role = ctx.meta && ctx.meta.user
			? ctx.meta.user.role
			: (ctx.params.actor_role || "system");

		// permesso scrittura
		this.assert(this.canWriteForActor(ctx, actor_id), "Forbidden", 403, "FORBIDDEN");

		try {
			const log = await this.Log.create({
				actor_id: actor_id,
				actor_role: actor_role,
				action: action,
				entity_type: entity_type || null,
				entity_id: entity_id || null,
				status: status || "ok",
				metadata: redact(metadata) || null,
				created_at: new Date()
			});

			// evento dominio utile se vuoi consumer real-time
			this.broker.emit("logs.created", {
				actor: { id: actor_id, role: actor_role },
				action: "logs.created",
				entity_type: "log",
				entity_id: log.id,
				status: "ok",
				metadata: {
					action,
					entity_type,
					entity_id,
					status
				}
			});

			return log.toJSON();
		} catch (err) {
			this.logger.error("Create log failed", err);
			throw this.mapSequelizeError(err, "Failed to create log");
		}
	}
};
