"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

function isPatient(ctx) {
	const u = ctx && ctx.meta && ctx.meta.user ? ctx.meta.user : null;
	return !!u && u.role === "patient";
}

module.exports = {
	auth: "required",
	params: {
		doctor_id: { type: "number", integer: true, positive: true, convert: true }
	},

	async handler(ctx) {
		const doctor_id = Number(ctx.params.doctor_id);
		const requester = this.getRequester ? this.getRequester(ctx) : (ctx.meta && ctx.meta.user ? ctx.meta.user : null);

		const actor = {
			id: requester && requester.id ? requester.id : null,
			role: requester && requester.role ? requester.role : "system"
		};

		const allowed =
			(this.isAdmin && this.isAdmin(ctx)) ||
			(this.isDoctor && this.isDoctor(ctx) && requester && Number(requester.id) === doctor_id) ||
			(this.isPatient ? this.isPatient(ctx) : isPatient(ctx));

		if (!allowed) {
			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.listByDoctor",
				entity_type: "availability_slot",
				entity_id: null,
				status: "error",
				metadata: { reason: "forbidden", doctor_id }
			});
			throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
		}

		try {
			const slots = await this.DoctorAvailability.findAll({
				where: { doctor_id },
				order: [["day_of_week", "ASC"], ["start_time", "ASC"], ["id", "ASC"]]
			});

			const result = slots.map(s => (typeof s.toJSON === "function" ? s.toJSON() : s));

			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.listByDoctor",
				entity_type: "availability_slot",
				entity_id: null,
				status: "ok",
				metadata: { doctor_id, count: result.length }
			});

			return result;
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.listByDoctor",
				entity_type: "availability_slot",
				entity_id: null,
				status: "error",
				metadata: { message: err.message, code: (typeof err.code !== "undefined" ? err.code : null), doctor_id }
			});
			this.logger.error("List availability slots failed", err);
			throw (this.mapSequelizeError ? this.mapSequelizeError(err, "Failed to list availability slots") : new MoleculerClientError("Failed to list availability slots", 500, "SERVER_ERROR"));
		}
	}
};
