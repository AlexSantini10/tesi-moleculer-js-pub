"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	rest: {
		method: "GET",
		path: "/:id"
	},
	params: {
		id: { type: "number", integer: true, positive: true }
	},
	async handler(ctx) {
		// actor da meta
		const actorUser = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		const actor = actorUser
			? { id: actorUser.id, role: actorUser.role }
			: { role: "system" };

		const id = ctx.params.id;

		try {
			const row = await this.Payment.findByPk(id);

			if (!row) {
				this.broker.emit("logs.record", {
					actor,
					action: "payments.payment.get",
					entity_type: "payment",
					entity_id: id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				this.assert(false, "Payment not found", 404, "NOT_FOUND");
			}

			// permessi: admin o owner
			if (!this.isAdmin(ctx) && (!actorUser || row.user_id !== actorUser.id)) {
				this.broker.emit("logs.record", {
					actor,
					action: "payments.payment.get",
					entity_type: "payment",
					entity_id: id,
					status: "error",
					metadata: { reason: "forbidden" }
				});
				throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
			}

			// emit successo
			this.broker.emit("payments.payment.fetched", {
				actor,
				action: "payments.payment.fetched",
				entity_type: "payment",
				entity_id: row.id,
				status: "ok",
				metadata: {
					amount: row.amount,
					currency: row.currency,
					method: row.method,
					status: row.status
				}
			});

			// risposta (sanitizzata)
			return this.sanitizePayment ? this.sanitizePayment(row) : row.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "payments.payment.get",
				entity_type: "payment",
				entity_id: id,
				status: "error",
				metadata: {
					reason: err && err.message ? err.message : "db_error",
					code: err && (err.code || err.type) ? (err.code || err.type) : null
				}
			});

			this.broker.emit("payments.payment.error", {
				actor,
				action: "payments.payment.error",
				entity_type: "payment",
				entity_id: id,
				status: "error",
				metadata: { phase: "get" }
			});

			throw this.mapSequelizeError ? this.mapSequelizeError(err, "Failed to get payment") : err;
		}
	}
};
