"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	rest: {
		method: "POST",
		path: "/"
	},
	params: {
		user_id: { type: "number", integer: true, positive: true },
		appointment_id: { type: "number", integer: true, positive: true },
		amount: { type: "string" },
		currency: { type: "string", optional: true },
		method: { type: "string" },
		provider: { type: "string", optional: true },
		provider_payment_id: { type: "string", optional: true },
		metadata: { type: "any", optional: true }
	},
	async handler(ctx) {
		const actor = ctx.meta && ctx.meta.user
			? { id: ctx.meta.user.id, role: ctx.meta.user.role }
			: { role: "system" };

		try {
			// validazione amount
			const amount = parseFloat(ctx.params.amount);
			if (isNaN(amount) || amount <= 0) {
				throw new MoleculerClientError("Invalid amount", 400, "INVALID_AMOUNT");
			}

			// whitelist method
			const allowedMethods = ["card", "bank_transfer", "cash"];
			if (!allowedMethods.includes(ctx.params.method.toLowerCase())) {
				throw new MoleculerClientError("Unsupported payment method", 400, "INVALID_METHOD");
			}

			// whitelist provider (aggiunto "test")
			const allowedProviders = ["stripe", "paypal", "test", null];
			if (ctx.params.provider && !allowedProviders.includes(ctx.params.provider.toLowerCase())) {
				throw new MoleculerClientError("Unsupported provider", 400, "INVALID_PROVIDER");
			}

			// metadata
			let metadata = {};
			if (ctx.params.metadata != null) {
				const parsed = this.safeParseJSON(ctx.params.metadata);
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					metadata = parsed;
				} else {
					throw new MoleculerClientError("Invalid metadata format", 400, "INVALID_METADATA");
				}
			}

			const payload = {
				user_id: ctx.params.user_id,
				appointment_id: ctx.params.appointment_id,
				amount: amount.toFixed(2),
				currency: (ctx.params.currency || "EUR").toUpperCase(),
				method: ctx.params.method.toLowerCase(),
				status: "pending",
				provider: ctx.params.provider ? ctx.params.provider.toLowerCase() : null,
				provider_payment_id: ctx.params.provider_payment_id || null,
				metadata
			};

			const created = await this.withTx(async function (t) {
				// prevenzione duplicati pending
				const existing = await this.Payment.findOne({
					where: { appointment_id: payload.appointment_id, status: "pending" },
					transaction: t
				});
				if (existing) {
					throw new MoleculerClientError(
						"Pending payment already exists for this appointment",
						409,
						"DUPLICATE_PENDING"
					);
				}

				const row = await this.Payment.create(payload, { transaction: t });

				if (t && typeof t.afterCommit === "function") {
					t.afterCommit(() => {
						this.broker.emit("payments.payment.created", {
							actor,
							action: "payments.payment.created",
							entity_type: "payment",
							entity_id: row.id,
							status: "ok",
							metadata: {
								amount: row.amount,
								currency: row.currency,
								method: row.method,
								provider: row.provider
							}
						});
					});
				}

				return row;
			}.bind(this));

			return created.toJSON();
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "payments.payment.create",
				entity_type: "payment",
				entity_id: null,
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
				entity_id: null,
				status: "error",
				metadata: { phase: "create" }
			});

			throw this.mapSequelizeError
				? this.mapSequelizeError(err, "Failed to create payment")
				: err;
		}
	}
};
