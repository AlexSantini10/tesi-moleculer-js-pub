"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	rest: {
		method: "POST",
		path: "/:id/refund"
	},
	params: {
		id: { type: "number", integer: true, positive: true },
		reason: { type: "string", optional: true }
	},
	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		// permessi
		if (!this.isAdmin(ctx) && actor.role !== "system") {
			throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
		}

		const id = ctx.params.id;

		try {
			const row = await this.withTx(async function (t) {
				const p = await this.Payment.findByPk(id, {
					transaction: t,
					lock: t.LOCK.UPDATE
				});
				if (!p) {
					this.broker.emit("logs.record", {
						actor,
						action: "payments.payment.refund",
						entity_type: "payment",
						entity_id: id,
						status: "error",
						metadata: { reason: "not_found" }
					});
					this.assert(false, "Payment not found", 404, "NOT_FOUND");
				}

				// idempotenza
				if (p.status === "refunded") {
					this.broker.emit("logs.record", {
						actor,
						action: "payments.payment.refund",
						entity_type: "payment",
						entity_id: p.id,
						status: "warning",
						metadata: { reason: "already_refunded" }
					});
					return p;
				}

				if (p.status !== "paid") {
					this.broker.emit("logs.record", {
						actor,
						action: "payments.payment.refund",
						entity_type: "payment",
						entity_id: p.id,
						status: "error",
						metadata: { reason: "invalid_status", current: p.status }
					});
					this.assert(false, "Only paid payments can be refunded", 422, "INVALID_STATUS");
				}

				// set refunded
				p.status = "refunded";
				const meta = Object.assign({}, p.metadata || {}, {
					refund_reason: ctx.params.reason || null,
					refunded_at: new Date().toISOString()
				});
				p.metadata = meta;
				await p.save({ transaction: t });

				if (t && typeof t.afterCommit === "function") {
					const self = this;
					t.afterCommit(function () {
						self.broker.emit("payments.payment.refunded", {
							actor,
							action: "payments.payment.refunded",
							entity_type: "payment",
							entity_id: p.id,
							status: "ok",
							metadata: {
								appointment_id: p.appointment_id || null,
								reason: ctx.params.reason || null
							}
						});
						self.broker.emit("logs.record", {
							actor,
							action: "payments.payment.refund",
							entity_type: "payment",
							entity_id: p.id,
							status: "ok",
							metadata: { reason: ctx.params.reason || null }
						});
					});
				}

				return p;
			}.bind(this));

			return row.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "payments.payment.refund",
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
				metadata: { phase: "refund" }
			});
			throw this.mapSequelizeError ? this.mapSequelizeError(err, "Failed to refund payment") : err;
		}
	}
};
