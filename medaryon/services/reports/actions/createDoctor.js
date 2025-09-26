"use strict";

const Errors = require("../../../errors");

module.exports = {
	rest: "POST /reports/doctor",
	auth: "required",

	params: {
		appointmentId: { type: "number", positive: true, convert: true },
		reportUrl: { type: "string", empty: false },
		title: { type: "string", optional: true, max: 255 },
		notes: { type: "string", optional: true },
		mimeType: { type: "string", optional: true, max: 100 },
		sizeBytes: { type: "number", integer: true, optional: true, convert: true },
		visibleToPatient: { type: "boolean", optional: true }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		const user = ctx.meta.user;
		if (!user || !user.id) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.createByDoctor",
				entity_type: "report",
				entity_id: null,
				status: "error",
				metadata: { reason: "unauthorized" }
			});
			throw Errors.UnauthorizedAccessError();
		}

		if (user.role !== "doctor" && user.role !== "admin") {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.createByDoctor",
				entity_type: "report",
				entity_id: null,
				status: "error",
				metadata: { reason: "forbidden_role", role: user.role }
			});
			throw Errors.ForbiddenError();
		}

		const appt = await this.getAppointment(ctx, ctx.params.appointmentId);
		if (!appt) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.createByDoctor",
				entity_type: "appointment",
				entity_id: ctx.params.appointmentId,
				status: "error",
				metadata: { reason: "not_found" }
			});
			throw Errors.NotFoundError("Appointment not found");
		}

		if (user.role !== "admin" && appt.doctor_id !== user.id) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.createByDoctor",
				entity_type: "appointment",
				entity_id: appt.id,
				status: "error",
				metadata: { reason: "forbidden_owner_mismatch" }
			});
			throw Errors.ForbiddenError();
		}

		const data = {
			appointment_id: appt.id,
			author_id: user.id,
			author_role: "doctor",
			title: ctx.params.title || null,
			notes: ctx.params.notes || null,
			report_url: ctx.params.reportUrl,
			mime_type: ctx.params.mimeType || null,
			size_bytes: ctx.params.sizeBytes || null,
			visible_to_patient: ctx.params.visibleToPatient !== undefined ? !!ctx.params.visibleToPatient : true,
			visible_to_doctor: true
		};

		try {
			// niente withTx → creiamo direttamente
			const row = await this.Report.create(data);

			this.broker.emit("reports.report.published", {
				actor,
				action: "reports.report.published",
				entity_type: "report",
				entity_id: row.id,
				status: "ok",
				metadata: {
					appointment_id: appt.id,
					author_role: "doctor",
					visible_to_patient: data.visible_to_patient
				}
			});

			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.createByDoctor",
				entity_type: "report",
				entity_id: row.id,
				status: "ok",
				metadata: { appointment_id: appt.id }
			});

			return this.sanitize ? this.sanitize(row) : row.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.createByDoctor",
				entity_type: "report",
				entity_id: null,
				status: "error",
				metadata: {
					reason: err && err.message ? err.message : "db_error",
					code: err && (err.code || err.type) ? (err.code || err.type) : null
				}
			});
			this.broker.emit("reports.report.error", {
				actor,
				action: "reports.report.error",
				entity_type: "report",
				entity_id: null,
				status: "error",
				metadata: { phase: "createByDoctor" }
			});
			throw this.mapSequelizeError ? this.mapSequelizeError(err) : err;
		}
	}
};
