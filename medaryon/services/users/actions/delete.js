"use strict";

const isAdmin = require("../utils/permissions").isAdmin;
const Errors = require("../../../errors");

module.exports = {
	auth: "required",

	params: {
		id: { type: "number", positive: true, convert: true }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		const user = ctx.meta.user;
		const targetId = ctx.params.id;

		// permessi
		if (!isAdmin(user)) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.user.delete",
				entity_type: "user",
				entity_id: targetId,
				status: "error",
				metadata: { reason: "forbidden" }
			});
			this.logger.warn("Unauthorized attempt to delete user", { attemptedBy: user.id, targetId });
			throw Errors.ForbiddenAccessError("Only admins can delete users");
		}

		try {
			const deleted = await this.withTx(async function (t) {
				const record = await this.User.findByPk(targetId, { transaction: t, lock: t.LOCK.UPDATE });
				if (!record) {
					this.broker.emit("logs.record", {
						actor,
						action: "users.user.delete",
						entity_type: "user",
						entity_id: targetId,
						status: "error",
						metadata: { reason: "not_found" }
					});
					throw Errors.UserNotFoundError(targetId);
				}

				await record.destroy({ transaction: t });

				if (t && typeof t.afterCommit === "function") {
					t.afterCommit(() => {
						this.broker.emit("users.user.deleted", {
							actor,
							action: "users.user.deleted",
							entity_type: "user",
							entity_id: targetId,
							status: "ok",
							metadata: null
						});
					});
				}

				return { deleted: 1 };
			}.bind(this));

			this.logger.info("User deleted", { deletedId: targetId, by: user.id });
			return deleted;
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.user.delete",
				entity_type: "user",
				entity_id: targetId || null,
				status: "error",
				metadata: {
					reason: err && err.message ? err.message : "db_error",
					code: err && (err.code || err.type) ? (err.code || err.type) : null
				}
			});
			this.logger.error("Error deleting user", err);
			const mapped = this.mapSequelizeError ? this.mapSequelizeError(err) : err;
			throw Errors.DBError(mapped && mapped.message ? mapped.message : "DB error");
		}
	}
};
