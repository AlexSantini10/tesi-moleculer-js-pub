"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	rest: {
		method: "PATCH",
		path: "/:id/status"
	},
	params: {
		id: { type: "number", integer: true, positive: true, convert: true },
		status: { type: "enum", values: ["pending", "paid", "failed", "refunded"] }
	},
	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		// permessi: admin, doctor o system
		if (!(this.isAdmin(ctx) || actor.role === "doctor" || actor.role === "system")) {
			throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
		}

		const id = ctx.params.id;
		const nextStatus = ctx.params.status;

		try {
			const updated = await this.withTx(async function (t) {
				const row = await this.Payment.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
				if (!row) {
					this.broker.emit("logs.record", {
						actor,
						action: "payments.payment.updateStatus",
						entity_type: "payment",
						entity_id: id,
						status: "error",
						metadata: { reason: "not_found" }
					});
					throw new MoleculerClientError("Payment not found", 404, "NOT_FOUND");
				}

				const prevStatus = row.status;

				// idempotenza
				if (prevStatus === nextStatus) {
					this.broker.emit("logs.record", {
						actor,
						action: "payments.payment.updateStatus",
						entity_type: "payment",
						entity_id: row.id,
						status: "warning",
						metadata: { reason: "already_in_status", status: prevStatus }
					});
					return row;
				}

				// validazione transizione refund
				if (nextStatus === "refunded" && prevStatus !== "paid") {
					this.broker.emit("logs.record", {
						actor,
						action: "payments.payment.updateStatus",
						entity_type: "payment",
						entity_id: row.id,
						status: "error",
						metadata: { reason: "invalid_transition", from: prevStatus, to: nextStatus }
					});
					throw new MoleculerClientError("Only paid payments can be refunded", 422, "INVALID_STATUS");
				}

				// aggiornamento stato
				row.status = nextStatus;
				await row.save({ transaction: t });

				if (t && typeof t.afterCommit === "function") {
					const self = this;
					t.afterCommit(function () {
						// evento generico
						self.broker.emit("payments.payment.statusChanged", {
							actor,
							action: "payments.payment.statusChanged",
							entity_type: "payment",
							entity_id: row.id,
							status: "ok",
							metadata: { from: prevStatus, to: nextStatus }
						});
						// eventi specifici
						if (nextStatus === "paid") {
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
						} else if (nextStatus === "failed") {
							self.broker.emit("payments.payment.failed", {
								actor,
								action: "payments.payment.failed",
								entity_type: "payment",
								entity_id: row.id,
								status: "error",
								metadata: { appointment_id: row.appointment_id || null }
							});
						} else if (nextStatus === "refunded") {
							self.broker.emit("payments.payment.refunded", {
								actor,
								action: "payments.payment.refunded",
								entity_type: "payment",
								entity_id: row.id,
								status: "ok",
								metadata: { appointment_id: row.appointment_id || null }
							});
						}
					});
				}

				return row;
			}.bind(this));

			return updated.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "payments.payment.updateStatus",
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
				metadata: { phase: "updateStatus" }
			});
			throw this.mapSequelizeError ? this.mapSequelizeError(err, "Failed to update payment status") : err;
		}
	}
};
