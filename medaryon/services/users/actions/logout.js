"use strict";

const Errors = require("../../../errors");

module.exports = {
	auth: "required",

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		const user = ctx.meta.user;

		if (!user) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.user.logout",
				entity_type: "user",
				entity_id: null,
				status: "error",
				metadata: { reason: "unauthorized" }
			});
			this.logger.warn("Logout attempted without valid user in context");
			throw Errors.UnauthorizedAccessError();
		}

		try {
			this.broker.emit("users.user.loggedOut", {
				actor: { id: user.id, role: user.role },
				action: "users.user.loggedOut",
				entity_type: "user",
				entity_id: user.id,
				status: "ok",
				metadata: null
			});

			this.logger.info("User logged out", { userId: user.id });
			return { message: "Logged out successfully" };
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.user.logout",
				entity_type: "user",
				entity_id: user.id || null,
				status: "error",
				metadata: {
					reason: err && err.message ? err.message : "logout_error",
					code: err && (err.code || err.type) ? (err.code || err.type) : null
				}
			});
			this.logger.error("Logout error", err);
			throw Errors.DBError("Logout failed");
		}
	}
};
