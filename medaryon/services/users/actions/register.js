"use strict";

const bcrypt = require("bcrypt");
const { Errors } = require("moleculer");
const { MoleculerClientError, MoleculerError } = Errors;

const VALID_ROLES = ["patient", "doctor", "admin"];

module.exports = {
	rest: "POST /users",
	auth: false,

	params: {
		email: "email",
		password: "string|min:6",
		role: { type: "string", optional: true, default: "patient" },
		first_name: { type: "string", optional: true },
		last_name: { type: "string", optional: true }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user ? { id: ctx.meta.user.id, role: ctx.meta.user.role } : { role: "system" };

		const email = String(ctx.params.email).trim().toLowerCase();
		const password = ctx.params.password;
		const role = ctx.params.role;
		const first_name = ctx.params.first_name;
		const last_name = ctx.params.last_name;

		this.logger.info("Creating user", { email, role });

		if (VALID_ROLES.indexOf(role) === -1) {
			this.broker.emit("logs.record", { actor, action: "users.user.create", entity_type: "user", entity_id: null, status: "error", metadata: { reason: "invalid_role", role } });
			throw new MoleculerClientError("Invalid role", 422, "INVALID_ROLE");
		}

		if (role === "admin") {
			const requester = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
			if (!requester || requester.role !== "admin") {
				this.broker.emit("logs.record", { actor, action: "users.user.create", entity_type: "user", entity_id: null, status: "error", metadata: { reason: "forbidden_admin_creation" } });
				throw new MoleculerClientError("Only admins can create admin users", 403, "FORBIDDEN");
			}
		}

		const existing = await this.User.findOne({ where: { email } });
		if (existing) {
			this.broker.emit("logs.record", { actor, action: "users.user.create", entity_type: "user", entity_id: null, status: "error", metadata: { reason: "email_exists" } });
			throw new MoleculerClientError("Email already in use", 409, "EMAIL_EXISTS");
		}

		const hashedPassword = await bcrypt.hash(password, 10);

		const user = await this.User.create({
			email,
			password: hashedPassword,
			role,
			first_name,
			last_name
		});

		this.logger.info("User created", { id: user.id, email: user.email });

		this.broker.emit("users.user.created", { actor, action: "users.user.created", entity_type: "user", entity_id: user.id, status: "ok", metadata: { role: user.role } });

		return this.sanitize ? this.sanitize(user) : { id: user.id, email: user.email, role: user.role };
	}
};
