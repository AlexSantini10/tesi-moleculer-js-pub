"use strict";

const { isOwnerOrAdmin } = require("../utils/permissions");
const Errors = require("../../../errors");

module.exports = {
	auth: "required",

	params: {
		id: { type: "number", convert: true, positive: true }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		const user = ctx.meta && ctx.meta.user;
		const targetId = ctx.params.id;

		// controllo auth
		if (!user || !user.id) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.user.get",
				entity_type: "user",
				entity_id: targetId,
				status: "error",
				metadata: { reason: "unauthorized" }
			});
			this.logger.warn("Missing or invalid user in context", { actor, targetId });
			throw Errors.UnauthorizedAccessError();
		}

		// verifica permessi
		if (!isOwnerOrAdmin(user, targetId)) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.user.get",
				entity_type: "user",
				entity_id: targetId,
				status: "error",
				metadata: { reason: "forbidden" }
			});
			this.logger.warn("Forbidden get attempt", { actor, targetId });
			throw Errors.ForbiddenError();
		}

		try {
			const record = await this.User.findByPk(targetId);
			if (!record) {
				this.broker.emit("logs.record", {
					actor,
					action: "users.user.get",
					entity_type: "user",
					entity_id: targetId,
					status: "error",
					metadata: { reason: "not_found" }
				});
				this.logger.warn("User not found", { actor, targetId });
				throw Errors.UserNotFoundError(targetId);
			}

			this.broker.emit("users.user.fetched", {
				actor,
				action: "users.user.fetched",
				entity_type: "user",
				entity_id: targetId,
				status: "ok",
				metadata: { by: user.id }
			});

			return this.sanitize ? this.sanitize(record) : record.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.user.get",
				entity_type: "user",
				entity_id: targetId,
				status: "error",
				metadata: {
					reason: (err && err.message) ? err.message : "db_error",
					code: (err && err.code) ? err.code : (err && err.type) ? err.type : null
				}
			});
			this.logger.error("Error in get user", { actor, targetId, err });
			const mapped = this.mapSequelizeError ? this.mapSequelizeError(err) : err;
			throw Errors.DBError((mapped && mapped.message) ? mapped.message : "DB error");
		}
	}
};
