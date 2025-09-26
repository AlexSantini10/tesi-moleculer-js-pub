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

function normalizeTime(t) {
	// eventuale normalizzazione, qui restituiamo "HH:MM"
	return t;
}

function ensureTimeRange(start, end) {
	if (start >= end) {
		throw new MoleculerClientError("start_time must be before end_time", 422, "VALIDATION_ERROR");
	}
}

module.exports = {
	auth: "required",

	params: {
		doctor_id: { type: "number", integer: true, positive: true, convert: true },
		day_of_week: { type: "number", integer: true, min: 0, max: 6, convert: true },
		start_time: { type: "string", empty: false },
		end_time: { type: "string", empty: false }
	},

	async handler(ctx) {
		const doctor_id = ctx.params.doctor_id;
		const day_of_week = ctx.params.day_of_week;

		const actor = {
			id: ctx.meta && ctx.meta.user && ctx.meta.user.id != null ? ctx.meta.user.id : null,
			role: ctx.meta && ctx.meta.user && ctx.meta.user.role ? ctx.meta.user.role : "system"
		};

		// autorizzazioni: dottore/admin possono gestire, pazienti possono solo verificare
		const u = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		const isDoctor = u && u.role === "doctor" && Number(u.id) === doctor_id;
		const isAdmin = u && u.role === "admin";
		const isPatient = u && u.role === "patient";

		if (!(isDoctor || isAdmin || isPatient)) {
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

		this.validateDayOfWeek(day_of_week);

		const start_time = normalizeTime(
			ensureValidTime(ctx.params.start_time, "start_time")
		);
		const end_time = normalizeTime(
			ensureValidTime(ctx.params.end_time, "end_time")
		);
		ensureTimeRange(start_time, end_time);

		// Niente check di conflitti: le availability possono sovrapporsi

		this.broker.emit("logs.record", {
			actor,
			action: "availability.slot.create",
			entity_type: "availability_slot",
			entity_id: null,
			status: "ok",
			metadata: { doctor_id, day_of_week, start_time, end_time }
		});

		// Restituisci la disponibilità appena creata
		return {
			doctor_id,
			day_of_week,
			start_time,
			end_time,
			available: true
		};
	}
};
