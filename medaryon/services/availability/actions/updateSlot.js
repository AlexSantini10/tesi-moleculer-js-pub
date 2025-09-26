"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	auth: "required",
	params: {
		id: { type: "number", integer: true, positive: true, convert: true },
		day_of_week: { type: "number", integer: true, min: 0, max: 6, optional: true, convert: true },
		start_time: { type: "string", optional: true },
		end_time: { type: "string", optional: true }
	},

	async handler(ctx) {
		const id = ctx.params.id;
		const inputDay = ctx.params.day_of_week;
		const inputStart = ctx.params.start_time;
		const inputEnd = ctx.params.end_time;

		const actor = {
			id: ctx.meta && ctx.meta.user && ctx.meta.user.id ? ctx.meta.user.id : null,
			role: ctx.meta && ctx.meta.user && ctx.meta.user.role ? ctx.meta.user.role : "system"
		};

		const slot = await this.DoctorAvailability.findByPk(id);
		if (!slot) {
			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.update",
				entity_type: "availability_slot",
				entity_id: id,
				status: "error",
				metadata: { reason: "not_found" }
			});
			throw new MoleculerClientError("Slot not found", 404, "NOT_FOUND");
		}

		try {
			this.assertAuthorizedDoctor(ctx, slot.doctor_id);
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.update",
				entity_type: "availability_slot",
				entity_id: id,
				status: "error",
				metadata: { reason: "forbidden", doctor_id: slot.doctor_id }
			});
			throw err;
		}

		const new_day = typeof inputDay !== "undefined" ? inputDay : slot.day_of_week;
		if (typeof inputDay !== "undefined") this.validateDayOfWeek(new_day);

		const rawStart = typeof inputStart !== "undefined" ? inputStart : slot.start_time;
		const rawEnd = typeof inputEnd !== "undefined" ? inputEnd : slot.end_time;

		const new_start = this.normalizeTime(this.ensureValidTime(rawStart, "start_time"));
		const new_end = this.normalizeTime(this.ensureValidTime(rawEnd, "end_time"));

		this.ensureTimeRange(new_start, new_end);

		if (
			new_day === slot.day_of_week &&
			new_start === slot.start_time &&
			new_end === slot.end_time
		) {
			return slot.toJSON();
		}

		const conflict = await this.slotConflictExists(
			slot.doctor_id,
			new_day,
			new_start,
			new_end,
			id
		);
		if (conflict) {
			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.update",
				entity_type: "availability_slot",
				entity_id: id,
				status: "error",
				metadata: {
					reason: "conflict",
					doctor_id: slot.doctor_id,
					day_of_week: new_day,
					start_time: new_start,
					end_time: new_end
				}
			});
			throw new MoleculerClientError("Slot conflicts with existing availability", 409, "CONFLICT");
		}

		const prev = {
			day_of_week: slot.day_of_week,
			start_time: slot.start_time,
			end_time: slot.end_time
		};

		Object.assign(slot, {
			day_of_week: new_day,
			start_time: new_start,
			end_time: new_end
		});

		try {
			await slot.save();

			this.broker.emit("availability.slot.updated", {
				actor,
				action: "availability.slot.updated",
				entity_type: "availability_slot",
				entity_id: id,
				status: "ok",
				metadata: {
					doctor_id: slot.doctor_id,
					prev,
					next: {
						day_of_week: slot.day_of_week,
						start_time: slot.start_time,
						end_time: slot.end_time
					}
				}
			});

			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.update",
				entity_type: "availability_slot",
				entity_id: id,
				status: "ok",
				metadata: {
					doctor_id: slot.doctor_id,
					prev,
					next: {
						day_of_week: slot.day_of_week,
						start_time: slot.start_time,
						end_time: slot.end_time
					}
				}
			});

			return slot.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.update",
				entity_type: "availability_slot",
				entity_id: id,
				status: "error",
				metadata: { message: err.message, code: err.code ? err.code : null }
			});
			this.logger.error("Update availability slot failed", err);
			throw this.mapSequelizeError(err, "Failed to update availability slot");
		}
	}
};
