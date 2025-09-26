"use strict";

/**
 * Un utente è stato eliminato/disattivato.
 * Se è un dottore, rimuove tutte le sue disponibilità.
 *
 * payload.data = { userId, reason? }
 */
module.exports = async function(payload) {
	try {
		const data = payload && payload.data ? payload.data : null;
		const userId = data ? Number(data.userId) : null;
		if (!userId) return;

		// prendi tutte le availability del dottore
		const slots = await this.DoctorAvailability.findAll({
			where: { doctor_id: userId }
		});

		if (!slots.length) return;

		for (const slot of slots) {
			const meta = {
				doctor_id: slot.doctor_id,
				day_of_week: slot.day_of_week,
				start_time: slot.start_time,
				end_time: slot.end_time,
				reason: "user_deleted"
			};

			try {
				await slot.destroy();

				// evento dominio
				this.broker.emit("availability.slot.deleted", {
					actor: { id: null, role: "system" },
					action: "availability.slot.deleted",
					entity_type: "availability_slot",
					entity_id: slot.id,
					status: "ok",
					metadata: meta
				});

				// log record
				this.broker.emit("logs.record", {
					actor: { id: null, role: "system" },
					action: "availability.slot.delete",
					entity_type: "availability_slot",
					entity_id: slot.id,
					status: "ok",
					metadata: meta
				});
			} catch (e) {
				this.logger.error("Failed to remove availability from user.deleted", { id: slot.id, message: e.message });

				this.broker.emit("logs.record", {
					actor: { id: null, role: "system" },
					action: "availability.slot.delete",
					entity_type: "availability_slot",
					entity_id: slot.id,
					status: "error",
					metadata: { message: e.message }
				});
			}
		}

		this.logger.info("users.user.deleted -> removed availability", { doctorId: userId, affected: slots.length });
	} catch (err) {
		this.logger.error("users.user.deleted handler error", { message: err && err.message });
	}
};
