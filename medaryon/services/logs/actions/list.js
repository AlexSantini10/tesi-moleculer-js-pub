"use strict";

const { Op } = require("sequelize");

module.exports = {
	auth: "required",
	params: {
		actor_id: { type: "number", optional: true, convert: true },
		actor_role: { type: "string", optional: true },
		action: { type: "string", optional: true },
		entity_type: { type: "string", optional: true },
		entity_id: { type: "number", optional: true, convert: true },
		status: { type: "string", optional: true },
		from: { type: "string", optional: true },
		to: { type: "string", optional: true },
		limit: { type: "number", optional: true, integer: true, min: 1, max: 200, convert: true, default: 50 },
		offset: { type: "number", optional: true, integer: true, min: 0, convert: true, default: 0 },
		order: { type: "string", optional: true, default: "created_at:DESC" }
	},
	async handler(ctx) {
		const u = this.getRequester(ctx);
		const actor = {
			id: u && u.id ? u.id : null,
			role: u && u.role ? u.role : "system"
		};

		try {
			// costruzione where
			const where = {};
			if (!this.isAdmin(ctx)) {
				where.actor_id = actor.id;
			} else if (ctx.params.actor_id != null) {
				where.actor_id = ctx.params.actor_id;
			}
			if (ctx.params.actor_role) where.actor_role = ctx.params.actor_role;
			if (ctx.params.action) where.action = ctx.params.action;
			if (ctx.params.entity_type) where.entity_type = ctx.params.entity_type;
			if (ctx.params.entity_id != null) where.entity_id = ctx.params.entity_id;
			if (ctx.params.status) where.status = ctx.params.status;

			if (ctx.params.from || ctx.params.to) {
				where.created_at = {};
				if (ctx.params.from) where.created_at[Op.gte] = new Date(ctx.params.from);
				if (ctx.params.to) where.created_at[Op.lte] = new Date(ctx.params.to);
			}

			// ordinamento
			let order = [["created_at", "DESC"]];
			if (ctx.params.order) {
				const parts = ctx.params.order.split(":");
				if (parts.length === 2) {
					const field = parts[0];
					const dir = parts[1].toUpperCase();
					if (dir === "ASC" || dir === "DESC") {
						order = [[field, dir]];
					}
				}
			}

			// paginazione
			const limit = ctx.params.limit || 50;
			const offset = ctx.params.offset || 0;

			const result = await this.Log.findAndCountAll({
				where,
				order,
				limit,
				offset
			});

			// log di successo
			this.broker.emit("logs.record", {
				actor,
				action: "logs.log.list",
				entity_type: "log",
				entity_id: null,
				status: "ok",
				metadata: { total: result.count, limit, offset }
			});

			return {
				total: result.count,
				limit,
				offset,
				items: result.rows.map(r => r.toJSON())
			};
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "logs.log.list",
				entity_type: "log",
				entity_id: null,
				status: "error",
				metadata: { message: err.message, code: err.code ? err.code : null }
			});
			this.logger.error("List logs failed", err);
			throw this.mapSequelizeError(err, "Failed to list logs");
		}
	}
};
