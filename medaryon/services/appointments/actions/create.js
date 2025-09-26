"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	params: {
		patient_id: { type: "number", integer: true, positive: true, convert: true },
		doctor_id: { type: "number", integer: true, positive: true, convert: true },
		scheduled_at: { 
			type: "string",
			pattern: /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/ // ISO 8601 UTC (Z)
		},
		notes: { type: "string", optional: true, min: 0, max: 2000, convert: true }
	},

	async handler(ctx) {
		const { patient_id, doctor_id, scheduled_at } = ctx.params;
		const notes = typeof ctx.params.notes === "string" ? ctx.params.notes.trim() : null;

		this.ensureCanCreate(ctx, { patient_id, doctor_id });

		const when = this.parseISODate(scheduled_at, "scheduled_at"); // Date UTC
		this.ensureFuture(when, "scheduled_at");

		// ricavo i parametri per availability
		const dayOfWeekUtc = when.getUTCDay(); // 0-6 (dom-sab) UTC
		const start_time = when.toISOString().slice(11, 16); // "HH:MM"
		const endDate = new Date(when.getTime() + 30 * 60000);
		const end_time = endDate.toISOString().slice(11, 16); // "HH:MM"

		// controllo disponibilità slot
		await ctx.call("availability.checkSlot", {
			doctor_id,
			day_of_week: dayOfWeekUtc,
			start_time,
			end_time
		});

		await this.assertNoConflict({ doctor_id, scheduled_at: when });

		const actorUser = (ctx.meta && ctx.meta.user) ? ctx.meta.user : null;
		const actor = {
			id: actorUser && actorUser.id ? actorUser.id : null,
			role: actorUser && actorUser.role ? actorUser.role : "system"
		};

		try {
			const appt = await this.Appointment.create({
				patient_id,
				doctor_id,
				scheduled_at: when,
				status: "requested",
				notes: notes && notes.length ? notes : null
			});

			const sanitized = this.sanitizePayload(appt);

			// evento "created"
			this.broker.emit("appointments.appointment.created", {
				actor,
				action: "appointments.appointment.created",
				entity_type: "appointment",
				entity_id: sanitized.id || null,
				status: "ok",
				metadata: { patient_id, doctor_id, scheduled_at: when.toISOString() }
			});

			// evento "statusChanged"
			this.broker.emit("appointments.appointment.statusChanged", {
				actor,
				action: "appointments.appointment.statusChanged",
				entity_type: "appointment",
				entity_id: sanitized.id || null,
				status: "ok",
				metadata: {
					from: null,
					to: "requested",
					patient_id,
					doctor_id,
					scheduled_at: when.toISOString()
				}
			});

			// log successo
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.create",
				entity_type: "appointment",
				entity_id: sanitized.id || null,
				status: "ok",
				metadata: { patient_id, doctor_id, scheduled_at: when.toISOString() }
			});

			return sanitized;
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "appointments.appointment.create",
				entity_type: "appointment",
				entity_id: null,
				status: "error",
				metadata: {
					message: err.message,
					code: (typeof err.code !== "undefined" ? err.code : null),
					patient_id,
					doctor_id,
					scheduled_at
				}
			});

			this.logger.error("Create appointment failed", err);
			if (err instanceof MoleculerClientError) throw err;
			throw this.mapSequelizeError(err, "Failed to create appointment");
		}
	}
};

