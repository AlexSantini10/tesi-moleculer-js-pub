"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	rest: {
		method: "POST",
		path: "/:id/mark-paid"
	},
	params: {
		id: { type: "number", integer: true, positive: true, convert: true }
	},
	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		// Permessi: admin, doctor o system
		if (!(this.isAdmin(ctx) || actor.role === "system" || actor.role === "doctor")) {
			throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
		}

		const id = ctx.params.id;

		try {
			const result = await this.withTx(async function (t) {
				const row = await this.Payment.findByPk(id, {
					transaction: t,
					lock: t.LOCK.UPDATE
				});
				if (!row) {
					this.broker.emit("logs.record", {
						actor,
						action: "payments.payment.markPaid",
						entity_type: "payment",
						entity_id: id,
						status: "error",
						metadata: { reason: "not_found" }
					});
					this.assert(false, "Payment not found", 404, "NOT_FOUND");
				}

				// Idempotente
				if (row.status === "paid") {
					this.broker.emit("logs.record", {
						actor,
						action: "payments.payment.markPaid",
						entity_type: "payment",
						entity_id: row.id,
						status: "warning",
						metadata: { reason: "already_paid" }
					});
					return row;
				}

				row.status = "paid";
				await row.save({ transaction: t });

				if (t && typeof t.afterCommit === "function") {
					const self = this;
					t.afterCommit(function () {
						self.broker.emit("payments.payment.completed", {
							actor,
							action: "payments.payment.completed",
							entity_type: "payment",
							entity_id: row.id,
							status: "ok",
							metadata: {
								appointment_id: row.appointment_id || null,
								amount: row.amount,
								currency: row.currency
							}
						});
						self.broker.emit("logs.record", {
							actor,
							action: "payments.payment.markPaid",
							entity_type: "payment",
							entity_id: row.id,
							status: "ok",
							metadata: { amount: row.amount, currency: row.currency }
						});
					});
				}

				return row;
			}.bind(this));

			return result.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "payments.payment.markPaid",
				entity_type: "payment",
				entity_id: id || null,
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
				entity_id: id || null,
				status: "error",
				metadata: { phase: "markPaid" }
			});
			throw this.mapSequelizeError ? this.mapSequelizeError(err, "Failed to mark payment as paid") : err;
		}
	}
};
