"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	rest: {
		method: "DELETE",
		path: "/:id"
	},
	params: {
		id: { type: "number", integer: true, positive: true }
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
			const removed = await this.withTx(async function (t) {
				const row = await this.Payment.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
				if (!row) {
					this.broker.emit("logs.record", {
						actor,
						action: "payments.payment.delete",
						entity_type: "payment",
						entity_id: id,
						status: "error",
						metadata: { reason: "not_found" }
					});
					this.assert(false, "Payment not found", 404, "NOT_FOUND");
				}

				if (row.status === "paid" || row.status === "refunded") {
					this.broker.emit("logs.record", {
						actor,
						action: "payments.payment.delete",
						entity_type: "payment",
						entity_id: row.id,
						status: "error",
						metadata: { reason: "immutable_status", status: row.status }
					});
					this.assert(false, "Cannot delete a paid or refunded payment", 409, "IMMUTABLE_STATUS");
				}

				await row.destroy({ transaction: t });

				if (t && typeof t.afterCommit === "function") {
					const self = this;
					t.afterCommit(function () {
						self.broker.emit("payments.payment.deleted", {
							actor,
							action: "payments.payment.deleted",
							entity_type: "payment",
							entity_id: id,
							status: "ok",
							metadata: null
						});
						self.broker.emit("logs.record", {
							actor,
							action: "payments.payment.delete",
							entity_type: "payment",
							entity_id: id,
							status: "ok",
							metadata: null
						});
					});
				}

				return { id, deleted: true };
			}.bind(this));

			return removed;
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "payments.payment.delete",
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
				metadata: { phase: "delete" }
			});
			throw this.mapSequelizeError ? this.mapSequelizeError(err, "Failed to delete payment") : err;
		}
	}
};
