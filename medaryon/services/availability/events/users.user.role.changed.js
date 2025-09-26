"use strict";

/**
 * Cambio ruolo utente.
 * Se da "doctor" passa ad un ruolo non-doctor, rimuove le disponibilità.
 *
 * payload.data = { userId, from, to }
 */
module.exports = async function(payload) {
	try {
		const data = payload && payload.data ? payload.data : null;
		if (!data) return;

		const userId = Number(data.userId);
		const from = String(data.from || "");
		const to = String(data.to || "");
		if (!userId) return;

		// era doctor ma non lo è più
		const wasDoctor = from === "doctor";
		const isDoctor = to === "doctor";
		if (wasDoctor && !isDoctor) {
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
					reason: "role_changed",
					from_role: from,
					to_role: to
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
					this.logger.error("Failed to remove availability from role.changed", { id: slot.id, message: e.message });

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

			this.logger.info("users.user.role.changed -> removed availability", { doctorId: userId, affected: slots.length });
		}
	} catch (err) {
		this.logger.error("users.user.role.changed handler error", { message: err && err.message });
	}
};
