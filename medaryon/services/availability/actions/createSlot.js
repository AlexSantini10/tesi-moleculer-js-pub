"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

function ensureValidTime(value, fieldName) {
	if (typeof value !== "string") {
		throw new MoleculerClientError("Invalid " + fieldName, 422, "VALIDATION_ERROR");
	}
	const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value);
	if (!m) {
		throw new MoleculerClientError("Invalid " + fieldName + " format", 422, "VALIDATION_ERROR");
	}
	return m[1].padStart(2, "0") + ":" + m[2];
}

module.exports = {
	auth: "required",
	params: {
		$$strict: true,
		doctor_id: { type: "number", integer: true, positive: true, convert: true },
		day_of_week: { type: "number", integer: true, min: 0, max: 6, convert: true },
		start_time: { type: "string" },
		end_time: { type: "string" }
	},

	async handler(ctx) {
		const doctor_id = Number(ctx.params.doctor_id);
		const day_of_week = Number(ctx.params.day_of_week);

		const actor = {
			id: (ctx.meta && ctx.meta.user && ctx.meta.user.id) ? ctx.meta.user.id : null,
			role: (ctx.meta && ctx.meta.user && ctx.meta.user.role) ? ctx.meta.user.role : "system"
		};

		// Solo admin o il dottore stesso possono creare availability
		const u = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		const allowed = (u && u.role === "admin") || (u && u.role === "doctor" && Number(u.id) === doctor_id);
		if (!allowed) {
			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.create",
				entity_type: "availability_slot",
				entity_id: null,
				status: "error",
				metadata: { reason: "forbidden", doctor_id }
			});
			throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
		}

		// Validazioni tempi
		const start_time = ensureValidTime(ctx.params.start_time, "start_time");
		const end_time = ensureValidTime(ctx.params.end_time, "end_time");
		if (start_time >= end_time) {
			throw new MoleculerClientError("start_time must be before end_time", 422, "VALIDATION_ERROR");
		}

		try {
			const slot = await this.DoctorAvailability.create({
				doctor_id,
				day_of_week,
				start_time,
				end_time
			});

			this.broker.emit("availability.slot.created", {
				actor,
				action: "availability.slot.created",
				entity_type: "availability_slot",
				entity_id: slot.id,
				status: "ok",
				metadata: { doctor_id, day_of_week, start_time, end_time }
			});

			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.create",
				entity_type: "availability_slot",
				entity_id: slot.id,
				status: "ok",
				metadata: { doctor_id, day_of_week, start_time, end_time }
			});

			return typeof slot.toJSON === "function" ? slot.toJSON() : slot;
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.create",
				entity_type: "availability_slot",
				entity_id: null,
				status: "error",
				metadata: { message: err.message, code: (err.code !== undefined ? err.code : null) }
			});
			this.logger.error("Create availability slot failed", err);
			if (typeof this.mapSequelizeError === "function") {
				throw this.mapSequelizeError(err, "Failed to create availability slot");
			}
			throw new MoleculerClientError("Failed to create availability slot", 500, "SERVER_ERROR");
		}
	}
};
