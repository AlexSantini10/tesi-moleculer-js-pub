"use strict";

const isOwnerOrAdmin = require("../utils/permissions").isOwnerOrAdmin;
const Errors = require("../../../errors");

module.exports = {
	auth: "required",

	params: {
		id: "number",
		first_name: { type: "string", optional: true },
		last_name: { type: "string", optional: true }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		const id = ctx.params.id;
		const first_name = ctx.params.first_name;
		const last_name = ctx.params.last_name;
		const user = ctx.meta.user;

		// permessi
		if (!isOwnerOrAdmin(user, id)) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.user.update",
				entity_type: "user",
				entity_id: id,
				status: "error",
				metadata: { reason: "forbidden" }
			});
			this.logger.warn("Unauthorized update attempt", { by: user.id, targetId: id });
			throw Errors.UnauthorizedAccessError();
		}

		try {
			const record = await this.User.findByPk(id);
			if (!record) {
				this.broker.emit("logs.record", {
					actor,
					action: "users.user.update",
					entity_type: "user",
					entity_id: id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				this.logger.warn("Update failed: user not found", { targetId: id });
				throw Errors.UserNotFoundError(id);
			}

			// costruzione update
			const updates = {};
			if (first_name !== undefined) updates.first_name = String(first_name).trim();
			if (last_name !== undefined) updates.last_name = String(last_name).trim();

			if (Object.keys(updates).length === 0) {
				return this.sanitize ? this.sanitize(record) : record.toJSON();
			}

			await record.update(updates);

			this.broker.emit("users.user.updated", {
				actor,
				action: "users.user.updated",
				entity_type: "user",
				entity_id: record.id,
				status: "ok",
				metadata: { updated: updates }
			});

			this.logger.info("User updated", { by: user.id, targetId: record.id });

			return this.sanitize ? this.sanitize(record) : record.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.user.update",
				entity_type: "user",
				entity_id: id,
				status: "error",
				metadata: {
					reason: err && err.message ? err.message : "db_error",
					code: err && (err.code || err.type) ? (err.code || err.type) : null
				}
			});
			this.logger.error("Error updating user", err);
			const mapped = this.mapSequelizeError ? this.mapSequelizeError(err) : err;
			throw Errors.DBError(mapped && mapped.message ? mapped.message : "DB error");
		}
	}
};
