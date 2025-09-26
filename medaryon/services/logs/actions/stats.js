"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;
const { Op, fn, col } = require("sequelize");

module.exports = {
	auth: "required",
	params: {
		from: { type: "string", optional: true },
		to: { type: "string", optional: true },
		groupBy: { type: "string", optional: true, default: "action" }
	},
	async handler(ctx) {
		if (!this.isAdmin(ctx)) {
			throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
		}

		const where = {};
		if (ctx.params.from) {
			where.created_at = Object.assign(where.created_at || {}, { [Op.gte]: new Date(ctx.params.from) });
		}
		if (ctx.params.to) {
			where.created_at = Object.assign(where.created_at || {}, { [Op.lte]: new Date(ctx.params.to) });
		}

		const groupField = ctx.params.groupBy === "status" ? "status" : "action";

		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { id: null, role: "system" };

		try {
			const rows = await this.Log.findAll({
				where,
				attributes: [
					[groupField, "key"],
					[fn("COUNT", col("*")), "count"]
				],
				group: [groupField],
				order: [[fn("COUNT", col("*")), "DESC"]]
			});

			const result = rows.map(r => {
				const json = r.toJSON();
				return { key: json.key, count: Number(json.count) };
			});

			// audit tramite logs.record
			this.broker.emit("logs.record", {
				actor,
				action: "logs.stats",
				entity_type: "log_stats",
				entity_id: null,
				status: "ok",
				metadata: {
					groupBy: groupField,
					from: ctx.params.from || null,
					to: ctx.params.to || null,
					items: result.length
				}
			});

			return result;
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "logs.stats",
				entity_type: "log_stats",
				entity_id: null,
				status: "error",
				metadata: {
					message: err.message,
					code: err.code ? err.code : null,
					groupBy: groupField
				}
			});

			this.logger.error("Stats generation failed", err);
			throw this.mapSequelizeError(err, "Failed to generate log stats");
		}
	}
};
