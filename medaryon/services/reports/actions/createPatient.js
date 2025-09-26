"use strict";

const Errors = require("../../../errors");

module.exports = {
	rest: "POST /patient",

	params: {
		appointmentId: { type: "number", positive: true, convert: true },
		reportUrl: { type: "string", empty: false },
		title: { type: "string", optional: true, max: 255 },
		notes: { type: "string", optional: true },
		mimeType: { type: "string", optional: true, max: 100 },
		sizeBytes: { type: "number", integer: true, optional: true, convert: true },
		visibleToDoctor: { type: "boolean", optional: true }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		const user = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		if (!user || !user.id) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.createByPatient",
				entity_type: "report",
				entity_id: null,
				status: "error",
				metadata: { reason: "unauthorized" }
			});
			throw Errors.UnauthorizedAccessError();
		}

		if (user.role !== "patient" && user.role !== "admin") {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.createByPatient",
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
				action: "reports.report.createByPatient",
				entity_type: "appointment",
				entity_id: ctx.params.appointmentId,
				status: "error",
				metadata: { reason: "not_found" }
			});
			throw Errors.NotFoundError("Appointment not found");
		}

		if (user.role !== "admin" && Number(appt.patient_id) !== Number(user.id)) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.createByPatient",
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
			author_role: "patient",
			title: ctx.params.title || null,
			notes: ctx.params.notes || null,
			report_url: ctx.params.reportUrl,
			mime_type: ctx.params.mimeType || null,
			size_bytes: ctx.params.sizeBytes || null,
			visible_to_patient: true,
			visible_to_doctor: ctx.params.visibleToDoctor !== undefined ? !!ctx.params.visibleToDoctor : true
		};

		try {
			const created = await this.withTx(async (t) => {
				const row = await this.Report.create(data, { transaction: t });

				if (t && typeof t.afterCommit === "function") {
					t.afterCommit(() => {
						this.broker.emit("reports.report.published", {
							actor,
							action: "reports.report.published",
							entity_type: "report",
							entity_id: row.id,
							status: "ok",
							metadata: {
								appointment_id: appt.id,
								author_role: "patient",
								visible_to_patient: true,
								visible_to_doctor: data.visible_to_doctor
							}
						});

						this.broker.emit("logs.record", {
							actor,
							action: "reports.report.createByPatient",
							entity_type: "report",
							entity_id: row.id,
							status: "ok",
							metadata: { appointment_id: appt.id }
						});
					});
				}

				return row;
			});

			return this.sanitize ? this.sanitize(created) : created.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.createByPatient",
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
				metadata: { phase: "createByPatient" }
			});
			throw this.mapSequelizeError ? this.mapSequelizeError(err) : err;
		}
	}
};
