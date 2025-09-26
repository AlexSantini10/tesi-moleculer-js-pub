"use strict";

const { Op } = require("sequelize");

module.exports = async function(payload) {
	try {
		const data = payload && payload.data ? payload.data : {};
		const next = data && data.to && data.to.start ? new Date(data.to.start) : null;

		if (!next) return;

		let where = null;
		if (data.appointmentId) {
			where = {
				id: Number(data.appointmentId),
				status: { [Op.in]: ["requested", "confirmed"] }
			};
		} else if (data.doctorId) {
			where = {
				doctor_id: Number(data.doctorId),
				status: { [Op.in]: ["requested", "confirmed"] }
			};
		}

		if (!where) return;

		const appts = await this.Appointment.findAll({ where });
		if (!appts.length) return;

		for (const appt of appts) {
			const prevDate = appt.scheduled_at && appt.scheduled_at.toISOString ? appt.scheduled_at.toISOString() : String(appt.scheduled_at);

			try {
				appt.scheduled_at = next;
				await appt.save();

				// evento dominio
				this.broker.emit("appointments.appointment.rescheduled", {
					actor: { id: null, role: "system" },
					action: "appointments.appointment.rescheduled",
					entity_type: "appointment",
					entity_id: appt.id,
					status: "ok",
					metadata: {
						from: prevDate,
						to: next.toISOString(),
						patient_id: appt.patient_id,
						doctor_id: appt.doctor_id,
						reason: "slot_updated"
					}
				});

				// log record
				this.broker.emit("logs.record", {
					actor: { id: null, role: "system" },
					action: "appointments.appointment.reschedule",
					entity_type: "appointment",
					entity_id: appt.id,
					status: "ok",
					metadata: {
						from: prevDate,
						to: next.toISOString(),
						patient_id: appt.patient_id,
						doctor_id: appt.doctor_id,
						reason: "slot_updated"
					}
				});
			} catch (e) {
				this.logger.error("Failed to reschedule appointment from slot.updated", { id: appt.id, message: e.message });
				this.broker.emit("logs.record", {
					actor: { id: null, role: "system" },
					action: "appointments.appointment.reschedule",
					entity_type: "appointment",
					entity_id: appt.id,
					status: "error",
					metadata: { message: e.message }
				});
			}
		}

		this.logger.info("availability.slot.updated -> rescheduled appointments", { affected: appts.length });
	} catch (err) {
		this.logger.error("availability.slot.updated handler error", { message: err && err.message });
	}
};
