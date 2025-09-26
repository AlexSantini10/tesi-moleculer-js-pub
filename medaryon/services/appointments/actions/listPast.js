"use strict";

const { Op, fn } = require("sequelize");
const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	params: {
		user_id: { type: "number", integer: true, positive: true, convert: true, optional: true },
		role: { type: "enum", values: ["patient", "doctor"], optional: true }
	},

	async handler(ctx) {
		const paramUserId = typeof ctx.params.user_id !== "undefined" ? ctx.params.user_id : null;
		const paramRole = typeof ctx.params.role !== "undefined" ? ctx.params.role : null;

		const metaUser = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		const metaUserId = metaUser ? Number(metaUser.id) : null;
		const metaRole = metaUser ? metaUser.role : null;

		const user_id = paramUserId != null ? paramUserId : metaUserId;
		const role = paramRole != null ? paramRole : metaRole;

		const actor = {
			id: metaUserId,
			role: metaRole || "system"
		};

		if (user_id == null || !role) {
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.listUpcomingByUser",
				entity_type: "appointment",
				entity_id: null,
				status: "error",
				metadata: { reason: "invalid_params", user_id: user_id == null ? null : user_id, role: role || null }
			});
			throw new MoleculerClientError("user_id and role are required", 422, "INVALID_PARAMS");
		}

		const requester = this.getRequester(ctx);
		if (!requester) {
			this.broker.emit("logs.record", {
				actor: { id: null, role: "system" },
				action: "appointments.appointment.listUpcomingByUser",
				entity_type: "appointment",
				entity_id: null,
				status: "error",
				metadata: { reason: "unauthorized", user_id, role }
			});
			throw new MoleculerClientError("Unauthorized", 401, "UNAUTHORIZED");
		}

		if (!this.isAdmin(ctx)) {
			if (role === "patient") {
				if (!(this.isPatient(ctx) && Number(requester.id) === Number(user_id))) {
					this.broker.emit("logs.record", {
						actor,
						action: "appointments.appointment.listUpcomingByUser",
						entity_type: "appointment",
						entity_id: null,
						status: "error",
						metadata: { reason: "forbidden", user_id, role }
					});
					throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
				}
			} else if (role === "doctor") {
				if (!(this.isDoctor(ctx) && Number(requester.id) === Number(user_id))) {
					this.broker.emit("logs.record", {
						actor,
						action: "appointments.appointment.listUpcomingByUser",
						entity_type: "appointment",
						entity_id: null,
						status: "error",
						metadata: { reason: "forbidden", user_id, role }
					});
					throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
				}
			} else {
				this.broker.emit("logs.record", {
					actor,
					action: "appointments.appointment.listUpcomingByUser",
					entity_type: "appointment",
					entity_id: null,
					status: "error",
					metadata: { reason: "invalid_role", role }
				});
				throw new MoleculerClientError("Invalid role", 422, "INVALID_ROLE");
			}
		}

		const where = { scheduled_at: { [Op.gt]: fn("NOW") } };
		if (role === "patient") where.patient_id = user_id;
		else where.doctor_id = user_id;

		try {
			const items = await this.Appointment.findAll({
				where,
				order: [["scheduled_at", "ASC"], ["id", "ASC"]]
			});

			const sanitized = items.map(a => this.sanitizePayload(a));

			// log successo
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.listUpcomingByUser",
				entity_type: "appointment",
				entity_id: null,
				status: "ok",
				metadata: { user_id, role, count: sanitized.length }
			});

			return sanitized;
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.listUpcomingByUser",
				entity_type: "appointment",
				entity_id: null,
				status: "error",
				metadata: { message: err.message, code: err.code ? err.code : null, user_id, role }
			});
			this.logger.error("List upcoming appointments by user failed", err);
			throw this.mapSequelizeError(err, "Failed to list upcoming appointments");
		}
	}
};
