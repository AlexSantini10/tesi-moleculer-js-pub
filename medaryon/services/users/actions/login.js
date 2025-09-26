"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const MoleculerError = require("moleculer").Errors.MoleculerError;
const Errors = require("../../../errors");

module.exports = {
	params: {
		email: "email",
		password: "string|min:6"
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		const email = ctx.params.email;
		const password = ctx.params.password;

		try {
			const user = await this.User.findOne({ where: { email: email } });

			if (!user || !user.password) {
				this.broker.emit("logs.record", {
					actor: actor,
					action: "users.user.login",
					entity_type: "user",
					entity_id: null,
					status: "error",
					metadata: { reason: "login_failed_unknown_email" }
				});
				this.broker.emit("users.user.loginFailed", {
					actor: actor,
					action: "users.user.loginFailed",
					entity_type: "user",
					entity_id: null,
					status: "error",
					metadata: null
				});
				this.logger.warn("Login failed: unknown email");
				throw Errors.LoginFailedError();
			}

			const match = await bcrypt.compare(password, user.password);
			if (!match) {
				this.broker.emit("logs.record", {
					actor: actor,
					action: "users.user.login",
					entity_type: "user",
					entity_id: user.id,
					status: "error",
					metadata: { reason: "login_failed_wrong_password" }
				});
				this.broker.emit("users.user.loginFailed", {
					actor: actor,
					action: "users.user.loginFailed",
					entity_type: "user",
					entity_id: user.id,
					status: "error",
					metadata: null
				});
				this.logger.warn("Login failed: wrong password");
				throw Errors.LoginFailedError();
			}

			if (!process.env.JWT_SECRET) {
				this.broker.emit("logs.record", {
					actor: actor,
					action: "users.user.login",
					entity_type: "user",
					entity_id: user.id,
					status: "error",
					metadata: { reason: "missing_jwt_secret" }
				});
				throw Errors.ServerConfigError("JWT secret not configured");
			}

			const token = jwt.sign(
				{ id: user.id, email: user.email, role: user.role },
				process.env.JWT_SECRET,
				{ expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
			);

			this.broker.emit("users.user.loggedIn", {
				actor: { id: user.id, role: user.role },
				action: "users.user.loggedIn",
				entity_type: "user",
				entity_id: user.id,
				status: "ok",
				metadata: { method: "password" }
			});

			this.logger.info("User logged in", { userId: user.id });

			return {
				token: token,
				user: {
					id: user.id,
					email: user.email,
					role: user.role,
					first_name: user.first_name,
					last_name: user.last_name
				}
			};
		} catch (err) {
			if (
				(err && err.type === "LOGIN_FAILED") ||
				(err && err.code === "LOGIN_FAILED") ||
				(err instanceof MoleculerError && err.type === "LOGIN_FAILED")
			) {
				throw err;
			}

			this.broker.emit("logs.record", {
				actor: actor,
				action: "users.user.login",
				entity_type: "user",
				entity_id: null,
				status: "error",
				metadata: {
					reason: err && err.message ? err.message : "db_error",
					code: err && (err.code || err.type) ? (err.code || err.type) : null
				}
			});
			this.broker.emit("users.user.error", {
				actor: actor,
				action: "users.user.error",
				entity_type: "user",
				entity_id: null,
				status: "error",
				metadata: { phase: "login" }
			});
			this.logger.error("Login error", err);

			const mapped = this.mapSequelizeError ? this.mapSequelizeError(err) : err;
			throw Errors.DBError(mapped && mapped.message ? mapped.message : "Database error");
		}
	}
};
