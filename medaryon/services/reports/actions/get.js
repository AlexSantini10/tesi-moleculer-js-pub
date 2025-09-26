"use strict";

const Errors = require("../../../errors");

module.exports = {
	rest: "GET /reports/:id",
	auth: "required",

	params: {
		id: { type: "number", positive: true, convert: true }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		const user = ctx.meta.user;
		if (!user || !user.id) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.get",
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
					action: "reports.report.get",
					entity_type: "report",
					entity_id: ctx.params.id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				throw Errors.NotFoundError("Report not found");
			}

			const appt = await this.getAppointment(ctx, report.appointment_id);

			if (!this.canSeeReport(user, report, appt)) {
				this.broker.emit("logs.record", {
					actor,
					action: "reports.report.get",
					entity_type: "report",
					entity_id: report.id,
					status: "error",
					metadata: { reason: "forbidden" }
				});
				throw Errors.ForbiddenError();
			}

			// eventi dominio + audit
			this.broker.emit("reports.report.fetched", {
				actor,
				action: "reports.report.fetched",
				entity_type: "report",
				entity_id: report.id,
				status: "ok",
				metadata: { appointment_id: report.appointment_id }
			});

			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.get",
				entity_type: "report",
				entity_id: report.id,
				status: "ok",
				metadata: { appointment_id: report.appointment_id }
			});

			return this.sanitize ? this.sanitize(report) : report.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.get",
				entity_type: "report",
				entity_id: ctx.params.id || null,
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
				entity_id: ctx.params.id || null,
				status: "error",
				metadata: { phase: "get" }
			});
			throw this.mapSequelizeError ? this.mapSequelizeError(err) : err;
		}
	}
};
