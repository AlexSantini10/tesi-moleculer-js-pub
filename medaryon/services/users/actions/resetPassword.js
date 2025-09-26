"use strict";

const bcrypt = require("bcrypt");
const Errors = require("../../../errors");

module.exports = {
	params: {
		token: "string",
		newPassword: "string|min:6"
	},

	async handler(ctx) {
		const actor = { role: "system" };
		const token = ctx.params.token;
		const newPassword = ctx.params.newPassword;

		// verifica token
		const entry = this.passwordResetTokens ? this.passwordResetTokens[token] : null;
		if (!entry || (entry.expiresAt && entry.expiresAt < Date.now())) {
			if (entry) delete this.passwordResetTokens[token]; // cleanup scaduto
			this.broker.emit("logs.record", {
				actor,
				action: "users.password.reset",
				entity_type: "user",
				entity_id: null,
				status: "error",
				metadata: { reason: "invalid_or_expired_token" }
			});
			this.logger.warn("Password reset with invalid or expired token");
			throw Errors.UnauthorizedAccessError();
		}

		const userId = entry.userId;

		try {
			const user = await this.User.findByPk(userId);
			if (!user) {
				this.broker.emit("logs.record", {
					actor,
					action: "users.password.reset",
					entity_type: "user",
					entity_id: userId,
					status: "error",
					metadata: { reason: "user_not_found" }
				});
				throw Errors.UserNotFoundError(userId);
			}

			const hashed = await bcrypt.hash(newPassword, 10);
			await user.update({ password: hashed });

			// cleanup tutti i token dell'utente
			for (const t in this.passwordResetTokens) {
				if (this.passwordResetTokens[t].userId === user.id) {
					delete this.passwordResetTokens[t];
				}
			}

			this.broker.emit("users.user.password.changed", {
				actor: { id: user.id, role: "system" },
				action: "users.user.password.changed",
				entity_type: "user",
				entity_id: user.id,
				status: "ok",
				metadata: { method: "reset_token" }
			});

			this.logger.info("Password reset successful", { userId: user.id });

			return { message: "Password reset successful" };
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.password.reset",
				entity_type: "user",
				entity_id: userId || null,
				status: "error",
				metadata: {
					reason: err && err.message ? err.message : "db_error",
					code: err && (err.code || err.type) ? (err.code || err.type) : null
				}
			});
			this.logger.error("Error during password reset", err);
			const mapped = this.mapSequelizeError ? this.mapSequelizeError(err) : err;
			throw Errors.DBError(mapped && mapped.message ? mapped.message : "DB error");
		}
	}
};
