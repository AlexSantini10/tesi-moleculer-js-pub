"use strict";

const crypto = require("crypto");
const Errors = require("../../../errors");

module.exports = {
	params: {
		email: "email"
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		try {
			// lookup utente
			const user = await this.User.findOne({ where: { email: ctx.params.email } });
			if (!user) {
				this.broker.emit("logs.record", {
					actor,
					action: "users.password.forgot",
					entity_type: "user",
					entity_id: null,
					status: "error",
					metadata: { reason: "not_found", email: ctx.params.email }
				});
				this.logger.warn("Reset password requested for non-existent email", { email: ctx.params.email });
				throw Errors.UserNotFoundError(ctx.params.email);
			}

			// genera token sicuro + scadenza
			const token = crypto.randomBytes(32).toString("hex");
			const expiresAt = Date.now() + 60 * 60 * 1000; // 1h

			// memorizza token in cache interna (TODO: usare redis/db per prod)
			this.passwordResetTokens = this.passwordResetTokens || {};
			this.passwordResetTokens[token] = { userId: user.id, expiresAt };

			// evento dominio → da qui puoi inviare email/push
			this.broker.emit("users.user.password.reset.requested", {
				actor,
				action: "users.user.password.reset.requested",
				entity_type: "user",
				entity_id: user.id,
				status: "ok",
				metadata: {
					email: user.email,
					token, // o hashtoken se non vuoi esporlo raw
					expiresAt: new Date(expiresAt).toISOString()
				}
			});

			this.logger.info("Password reset requested", { userId: user.id, email: user.email });

			return { message: "Reset link sent" };
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "users.password.forgot",
				entity_type: "user",
				entity_id: null,
				status: "error",
				metadata: {
					reason: err && err.message ? err.message : "db_error",
					code: err && (err.code || err.type) ? (err.code || err.type) : null
				}
			});
			this.logger.error("Error in forgotPassword", err);
			const mapped = this.mapSequelizeError ? this.mapSequelizeError(err) : err;
			throw Errors.DBError(mapped && mapped.message ? mapped.message : "DB error");
		}
	}
};
