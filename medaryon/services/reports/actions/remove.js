"use strict";

const Errors = require("../../../errors");

module.exports = {
	rest: "DELETE /reports/:id",
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
				action: "reports.report.delete",
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
					action: "reports.report.delete",
					entity_type: "report",
					entity_id: ctx.params.id,
					status: "warning",
					metadata: { reason: "not_found" }
				});
				return { deleted: 0 }; // idempotente
			}

			if (user.role !== "admin") {
				if (report.author_id !== user.id) {
					this.broker.emit("logs.record", {
						actor,
						action: "reports.report.delete",
						entity_type: "report",
						entity_id: report.id,
						status: "error",
						metadata: { reason: "forbidden" }
					});
					throw Errors.ForbiddenError();
				}
			}

			const deleted = await this.Report.destroy({ where: { id: report.id } });

			this.broker.emit("reports.report.deleted", {
				actor,
				action: "reports.report.deleted",
				entity_type: "report",
				entity_id: report.id,
				status: "ok",
				metadata: {
					appointment_id: report.appointment_id,
					author_role: report.author_role
				}
			});

			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.delete",
				entity_type: "report",
				entity_id: report.id,
				status: "ok",
				metadata: { deleted }
			});

			return { deleted };
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "reports.report.delete",
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
				metadata: { phase: "delete" }
			});
			throw this.mapSequelizeError ? this.mapSequelizeError(err) : err;
		}
	}
};
