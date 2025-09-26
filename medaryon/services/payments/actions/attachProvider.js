"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	rest: {
		method: "PATCH",
		path: "/:id/provider"
	},
	params: {
		id: { type: "number", integer: true, positive: true },
		provider: { type: "string" },
		provider_payment_id: { type: "string" },
		metadata: { type: "any", optional: true }
	},
	async handler(ctx) {
		// attore da meta
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		// permessi: admin o system
		if (!(this.isAdmin(ctx) || actor.role === "system")) {
			this.broker.emit("logs.record", {
				actor,
				action: "payments.payment.updateProvider",
				entity_type: "payment",
				entity_id: ctx.params.id,
				status: "error",
				metadata: { reason: "forbidden" }
			});
			throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
		}

		// whitelist provider
		const allowedProviders = ["stripe", "paypal"];
		const provider = ctx.params.provider.toLowerCase();
		if (!allowedProviders.includes(provider)) {
			throw new MoleculerClientError("Unsupported provider", 400, "INVALID_PROVIDER");
		}

		// regex provider_payment_id
		const providerId = ctx.params.provider_payment_id;
		if (!/^[a-zA-Z0-9\-_]{3,128}$/.test(providerId)) {
			throw new MoleculerClientError("Invalid provider_payment_id format", 400, "INVALID_PROVIDER_ID");
		}

		try {
			const id = ctx.params.id;

			const updated = await this.withTx(async function (t) {
				const row = await this.Payment.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
				if (!row) {
					this.broker.emit("logs.record", {
						actor,
						action: "payments.payment.updateProvider",
						entity_type: "payment",
						entity_id: id,
						status: "error",
						metadata: { reason: "not_found" }
					});
					throw new MoleculerClientError("Payment not found", 404, "NOT_FOUND");
				}

				// aggiornamento campi provider
				row.provider = provider;
				row.provider_payment_id = providerId;

				// merge metadata se valido
				if (ctx.params.metadata != null) {
					const incoming = this.safeParseJSON(ctx.params.metadata);
					if (incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
						row.metadata = Object.assign({}, row.metadata || {}, incoming);
					} else {
						throw new MoleculerClientError("Invalid metadata format", 400, "INVALID_METADATA");
					}
				}

				await row.save({ transaction: t });

				if (t && typeof t.afterCommit === "function") {
					t.afterCommit(() => {
						this.broker.emit("payments.payment.providerLinked", {
							actor,
							action: "payments.payment.providerLinked",
							entity_type: "payment",
							entity_id: row.id,
							status: "ok",
							metadata: { provider: row.provider }
						});
					});
				}

				return row;
			}.bind(this));

			return updated.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "payments.payment.updateProvider",
				entity_type: "payment",
				entity_id: ctx.params && ctx.params.id ? ctx.params.id : null,
				status: "error",
				metadata: {
					reason: err.message,
					code: err.code || null
				}
			});

			this.broker.emit("payments.payment.error", {
				actor,
				action: "payments.payment.error",
				entity_type: "payment",
				entity_id: ctx.params && ctx.params.id ? ctx.params.id : null,
				status: "error",
				metadata: { phase: "updateProvider" }
			});

			throw this.mapSequelizeError ? this.mapSequelizeError(err, "Failed to link payment provider") : err;
		}
	}
};
