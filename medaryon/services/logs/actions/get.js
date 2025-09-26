"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	auth: "required",
	params: {
		id: { type: "number", convert: true }
	},
	async handler(ctx) {
		const id = ctx.params.id;

		const user = ctx && ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		const actorId = user ? user.id : null;
		const actorRole = user ? user.role : "system";

		try {
			const log = await this.Log.findByPk(id);
			if (!log) {
				this.broker.emit("logs.record", {
					actor: { id: actorId, role: actorRole },
					action: "logs.log.get",
					entity_type: "log",
					entity_id: id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				throw new MoleculerClientError("Log not found", 404, "NOT_FOUND");
			}

			if (!this.canReadLog(ctx, log)) {
				this.broker.emit("logs.record", {
					actor: { id: actorId, role: actorRole },
					action: "logs.log.get",
					entity_type: "log",
					entity_id: id,
					status: "error",
					metadata: { reason: "forbidden" }
				});
				throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
			}

			// log di successo
			this.broker.emit("logs.record", {
				actor: { id: actorId, role: actorRole },
				action: "logs.log.get",
				entity_type: "log",
				entity_id: id,
				status: "ok",
				metadata: {}
			});

			return log.toJSON();
		} catch (err) {
			if (!(err instanceof MoleculerClientError && (err.code === 404 || err.code === 403))) {
				this.broker.emit("logs.record", {
					actor: { id: actorId, role: actorRole },
					action: "logs.log.get",
					entity_type: "log",
					entity_id: id,
					status: "error",
					metadata: { message: err.message, code: err.code ? err.code : null }
				});
				this.logger.error("Get log failed", err);
			}
			throw this.mapSequelizeError(err, "Failed to get log");
		}
	}
};
