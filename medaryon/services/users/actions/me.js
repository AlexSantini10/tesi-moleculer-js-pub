"use strict";

const Errors = require("../../../errors");

module.exports = {
	auth: "required",
	rest: "GET /me",

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		const user = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		if (!user || !user.id) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.me.get",
				entity_type: "user",
				entity_id: null,
				status: "error",
				metadata: { reason: "unauthorized" }
			});
			throw Errors.UnauthorizedAccessError();
		}

		try {
			const foundUser = await this.User.findByPk(user.id);
			if (!foundUser) {
				this.broker.emit("logs.record", {
					actor,
					action: "users.me.get",
					entity_type: "user",
					entity_id: user.id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				throw Errors.UserNotFoundError(user.id);
			}

			this.broker.emit("users.user.meFetched", {
				actor,
				action: "users.user.meFetched",
				entity_type: "user",
				entity_id: foundUser.id,
				status: "ok",
				metadata: null
			});

			return this.sanitize ? this.sanitize(foundUser) : foundUser.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.me.get",
				entity_type: "user",
				entity_id: user ? user.id : null,
				status: "error",
				metadata: {
					reason: err && err.message ? err.message : "db_error",
					code: err && (err.code || err.type) ? (err.code || err.type) : null
				}
			});
			const mapped = this.mapSequelizeError ? this.mapSequelizeError(err) : err;
			throw Errors.DBError(mapped && mapped.message ? mapped.message : "DB error");
		}
	}
};
