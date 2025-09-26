"use strict";

const { isAdmin } = require("../utils/permissions");
const Errors = require("../../../errors");

module.exports = {
	auth: "required",

	params: {
		page: { type: "number", convert: true, positive: true, optional: true },
		pageSize: { type: "number", convert: true, positive: true, optional: true, max: 100 },
		role: { type: "string", optional: true, enum: ["patient", "doctor", "admin"] }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		const user = ctx.meta.user;

		if (!isAdmin(user)) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.user.list",
				entity_type: "user",
				entity_id: null,
				status: "error",
				metadata: { reason: "forbidden" }
			});
			this.logger.warn("Unauthorized access to list users", { userId: user && user.id ? user.id : null });
			throw Errors.ForbiddenAccessError("Only admins can list all users");
		}

		try {
			const page = ctx.params.page || 1;
			const pageSize = ctx.params.pageSize || 20;
			const where = {};

			if (ctx.params.role) where.role = ctx.params.role;

			const result = await this.User.findAndCountAll({
				where,
				order: [["created_at", "DESC"]],
				limit: pageSize,
				offset: (page - 1) * pageSize
			});

			this.broker.emit("users.list.fetched", {
				actor,
				action: "users.list.fetched",
				entity_type: "user",
				entity_id: null,
				status: "ok",
				metadata: { count: result.count, page, pageSize }
			});

			const items = this.sanitize
				? result.rows.map(u => this.sanitize(u))
				: result.rows.map(u => {
					const obj = u.toJSON();
					delete obj.password;
					return obj;
				});

			return { page, pageSize, total: result.count, items };
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.user.list",
				entity_type: "user",
				entity_id: null,
				status: "error",
				metadata: {
					reason: (err && err.message) ? err.message : "db_error",
					code: (err && err.code) ? err.code : (err && err.type) ? err.type : null
				}
			});
			this.broker.emit("users.user.error", {
				actor,
				action: "users.user.error",
				entity_type: "user",
				entity_id: null,
				status: "error",
				metadata: { phase: "list" }
			});
			this.logger.error("Error listing users", err);
			const mapped = this.mapSequelizeError ? this.mapSequelizeError(err) : err;
			throw Errors.DBError((mapped && mapped.message) ? mapped.message : "DB error");
		}
	}
};
