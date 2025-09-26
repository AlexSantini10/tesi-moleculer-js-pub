"use strict";

const Errors = require("../../../errors");

module.exports = {
	rest: "PATCH /reports/:id/visibility",
	auth: "required",

	params: {
		id: { type: "number", convert: true },
		visibleToPatient: { type: "boolean", optional: true },
		visibleToDoctor: { type: "boolean", optional: true }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		const user = ctx.meta.user;
		if (!user || !user.id) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.updateVisibility",
				entity_type: "report",
				entity_id: ctx.params.id || null,
				status: "error",
				metadata: { reason: "unauthorized" }
			});
			throw Errors.UnauthorizedAccessError();
		}

		try {
			const report = await this.Report.findByPk(ctx.params.id);
			if (!report) {
				this.broker.emit("logs.record", {
					actor,
					action: "reports.report.updateVisibility",
					entity_type: "report",
					entity_id: ctx.params.id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				throw Errors.NotFoundError("Report not found");
			}

			if (user.role !== "admin") {
				if (report.author_id !== user.id) {
					this.broker.emit("logs.record", {
						actor,
						action: "reports.report.updateVisibility",
						entity_type: "report",
						entity_id: report.id,
						status: "error",
						metadata: { reason: "forbidden" }
					});
					throw Errors.ForbiddenError();
				}
			}

			const updates = {};
			if (ctx.params.visibleToPatient !== undefined) {
				updates.visible_to_patient = !!ctx.params.visibleToPatient;
			}
			if (ctx.params.visibleToDoctor !== undefined) {
				updates.visible_to_doctor = !!ctx.params.visibleToDoctor;
			}

			if (Object.keys(updates).length === 0) {
				return this.sanitize ? this.sanitize(report) : report.toJSON();
			}

			const prev = {
				visible_to_patient: report.visible_to_patient,
				visible_to_doctor: report.visible_to_doctor
			};

			Object.assign(report, updates, { updated_at: new Date() });
			await report.save();

			this.broker.emit("reports.report.visibilityChanged", {
				actor,
				action: "reports.report.visibilityChanged",
				entity_type: "report",
				entity_id: report.id,
				status: "ok",
				metadata: {
					appointment_id: report.appointment_id,
					from: prev,
					to: {
						visible_to_patient: report.visible_to_patient,
						visible_to_doctor: report.visible_to_doctor
					}
				}
			});

			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.updateVisibility",
				entity_type: "report",
				entity_id: report.id,
				status: "ok",
				metadata: { updates }
			});

			return this.sanitize ? this.sanitize(report) : report.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.updateVisibility",
				entity_type: "report",
				entity_id: ctx.params && ctx.params.id ? ctx.params.id : null,
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
				entity_id: ctx.params && ctx.params.id ? ctx.params.id : null,
				status: "error",
				metadata: { phase: "updateVisibility" }
			});
			throw this.mapSequelizeError ? this.mapSequelizeError(err) : err;
		}
	}
};
