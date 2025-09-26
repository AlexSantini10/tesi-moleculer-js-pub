"use strict";

const { Op } = require("sequelize");
const Errors = require("../../../errors");
const { filterWhereForRole } = require("../utils/visibility");

module.exports = {
	rest: "GET /appointments/:appointmentId/reports",
	auth: "required",

	params: {
		appointmentId: { type: "number", positive: true, convert: true }
	},

	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		const user = ctx.meta.user;
		if (!user || !user.id) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.listForAppointment",
				entity_type: "appointment",
				entity_id: ctx.params.appointmentId || null,
				status: "error",
				metadata: { reason: "unauthorized" }
			});
			throw Errors.UnauthorizedAccessError();
		}

		try {
			const appt = await this.getAppointment(ctx, ctx.params.appointmentId);
			if (!appt) {
				this.broker.emit("logs.record", {
					actor,
					action: "reports.report.listForAppointment",
					entity_type: "appointment",
					entity_id: ctx.params.appointmentId,
					status: "error",
					metadata: { reason: "not_found" }
				});
				throw Errors.NotFoundError("Appointment not found");
			}

			if (!this.canAccessAppointment(user, appt)) {
				this.broker.emit("logs.record", {
					actor,
					action: "reports.report.listForAppointment",
					entity_type: "appointment",
					entity_id: appt.id,
					status: "error",
					metadata: { reason: "forbidden" }
				});
				throw Errors.ForbiddenError();
			}

			const roleFilter = filterWhereForRole(user.role, user.id);
			const where = {
				appointment_id: appt.id,
				[Op.or]: Array.isArray(roleFilter) ? roleFilter : [roleFilter]
			};

			const rows = await this.Report.findAll({
				where,
				order: [["created_at", "ASC"]]
			});

			this.broker.emit("reports.report.listFetched", {
				actor,
				action: "reports.report.listFetched",
				entity_type: "report",
				entity_id: null,
				status: "ok",
				metadata: { appointment_id: appt.id, count: rows.length }
			});

			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.listForAppointment",
				entity_type: "appointment",
				entity_id: appt.id,
				status: "ok",
				metadata: { reports: rows.length }
			});

			return this.sanitize
				? rows.map(r => this.sanitize(r))
				: rows.map(r => r.toJSON());
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.listForAppointment",
				entity_type: "appointment",
				entity_id: ctx.params && ctx.params.appointmentId ? ctx.params.appointmentId : null,
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
				metadata: { phase: "listForAppointment" }
			});
			throw this.mapSequelizeError ? this.mapSequelizeError(err) : err;
		}
	}
};
