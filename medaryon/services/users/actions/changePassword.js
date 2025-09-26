"use strict";

const bcrypt = require("bcrypt");
const Errors = require("../../../errors");

module.exports = {
	auth: "required",

	params: {
		userId: { type: "number", positive: true, convert: true },
		oldPassword: { type: "string", min: 6 },
		newPassword: { type: "string", min: 6 }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		try {
			const { userId, oldPassword, newPassword } = ctx.params;
			const currentUser = ctx.meta.user;

			// permessi
			if (currentUser.id !== userId && currentUser.role !== "admin") {
				this.broker.emit("logs.record", {
					actor,
					action: "users.password.change",
					entity_type: "user",
					entity_id: userId,
					status: "error",
					metadata: { reason: "forbidden" }
				});
				throw Errors.ForbiddenAccessError("You can only change your own password");
			}

			// fetch utente
			const user = await this.User.findByPk(userId);
			if (!user) {
				this.broker.emit("logs.record", {
					actor,
					action: "users.password.change",
					entity_type: "user",
					entity_id: userId,
					status: "error",
					metadata: { reason: "not_found" }
				});
				throw Errors.UserNotFoundError(userId);
			}

			// verifica password attuale
			const valid = await bcrypt.compare(oldPassword, user.password);
			if (!valid) {
				this.broker.emit("logs.record", {
					actor,
					action: "users.password.change",
					entity_type: "user",
					entity_id: user.id,
					status: "error",
					metadata: { reason: "invalid_old_password" }
				});
				throw Errors.UnauthorizedAccessError("Invalid password");
			}

			// idempotenza
			const same = await bcrypt.compare(newPassword, user.password);
			if (same) {
				this.broker.emit("logs.record", {
					actor,
					action: "users.password.change",
					entity_type: "user",
					entity_id: user.id,
					status: "warning",
					metadata: { reason: "same_password" }
				});
				return { message: "New password is identical to the current one" };
			}

			// hashing nuova password
			const hashed = await bcrypt.hash(newPassword, 10);

			// update
			await user.update({ password: hashed });

			// evento dominio
			this.broker.emit("users.user.password.changed", {
				actor,
				action: "users.user.password.changed",
				entity_type: "user",
				entity_id: user.id,
				status: "ok",
				metadata: null
			});

			return { message: "Password updated successfully", userId: user.id };
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.password.change",
				entity_type: "user",
				entity_id: ctx.params && ctx.params.userId ? ctx.params.userId : null,
				status: "error",
				metadata: {
					reason: err && err.message ? err.message : "db_error",
					code: err && (err.code || err.type) ? (err.code || err.type) : null
				}
			});
			this.broker.emit("users.user.error", {
				actor,
				action: "users.user.error",
				entity_type: "user",
				entity_id: ctx.params && ctx.params.userId ? ctx.params.userId : null,
				status: "error",
				metadata: { phase: "passwordChange" }
			});
			const mapped = this.mapSequelizeError ? this.mapSequelizeError(err) : err;
			throw Errors.DBError(mapped && mapped.message ? mapped.message : err.message);
		}
	}
};
