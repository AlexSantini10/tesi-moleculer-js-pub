"use strict";

const { Op } = require("sequelize");

module.exports = async function(payload) {
	try {
		const data = payload && payload.data ? payload.data : {};
		let where = null;

		if (data.appointmentId) {
			where = {
				id: Number(data.appointmentId),
				status: { [Op.in]: ["requested", "confirmed"] }
			};
		} else if (data.doctorId && data.start) {
			where = {
				doctor_id: Number(data.doctorId),
				scheduled_at: new Date(data.start),
				status: { [Op.in]: ["requested", "confirmed"] }
			};
		}

		if (!where) return;

		const appts = await this.Appointment.findAll({ where });
		if (!appts.length) return;

		for (const appt of appts) {
			const prevStatus = appt.status;
			appt.status = "cancelled";

			try {
				await appt.save();

				const scheduledIso = appt.scheduled_at && appt.scheduled_at.toISOString ? appt.scheduled_at.toISOString() : String(appt.scheduled_at);

				// evento dominio
				this.broker.emit("appointments.appointment.statusChanged", {
					actor: { id: null, role: "system" },
					action: "appointments.appointment.statusChanged",
					entity_type: "appointment",
					entity_id: appt.id,
					status: "ok",
					metadata: {
						from: prevStatus,
						to: "cancelled",
						patient_id: appt.patient_id,
						doctor_id: appt.doctor_id,
						scheduled_at: scheduledIso,
						reason: "slot_deleted"
					}
				});

				// log record
				this.broker.emit("logs.record", {
					actor: { id: null, role: "system" },
					action: "appointments.appointment.cancel",
					entity_type: "appointment",
					entity_id: appt.id,
					status: "ok",
					metadata: {
						from: prevStatus,
						to: "cancelled",
						patient_id: appt.patient_id,
						doctor_id: appt.doctor_id,
						scheduled_at: scheduledIso,
						reason: "slot_deleted"
					}
				});
			} catch (e) {
				this.logger.error("Failed to cancel appointment from slot.deleted", { id: appt.id, message: e.message });
				this.broker.emit("logs.record", {
					actor: { id: null, role: "system" },
					action: "appointments.appointment.cancel",
					entity_type: "appointment",
					entity_id: appt.id,
					status: "error",
					metadata: { message: e.message }
				});
			}
		}

		this.logger.info("availability.slot.deleted -> cancelled appointments", { affected: appts.length });
	} catch (err) {
		this.logger.error("availability.slot.deleted handler error", { message: err && err.message });
	}
};
