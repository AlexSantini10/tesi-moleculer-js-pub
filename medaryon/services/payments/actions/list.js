"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	rest: {
		method: "GET",
		path: "/"
	},
	params: {
		page: { type: "number", integer: true, positive: true, optional: true, convert: true },
		pageSize: { type: "number", integer: true, positive: true, optional: true, convert: true },
		user_id: { type: "number", integer: true, positive: true, optional: true, convert: true },
		appointment_id: { type: "number", integer: true, positive: true, optional: true, convert: true },
		status: { type: "string", optional: true },
		method: { type: "string", optional: true },
		provider: { type: "string", optional: true },
		sort: { type: "string", optional: true }
	},
	async handler(ctx) {
		const actorUser = ctx.meta && ctx.meta.user ? ctx.meta.user : null;
		const actor = actorUser
			? { id: actorUser.id, role: actorUser.role }
			: { role: "system" };

		try {
			// paginazione
			const page = ctx.params.page || 1;
			const pageSize = Math.min(ctx.params.pageSize || 20, 100);

			// filtri base
			const where = {};
			if (ctx.params.user_id) where.user_id = ctx.params.user_id;
			if (ctx.params.appointment_id) where.appointment_id = ctx.params.appointment_id;
			if (ctx.params.status) where.status = ctx.params.status;
			if (ctx.params.method) where.method = ctx.params.method;
			if (ctx.params.provider) where.provider = ctx.params.provider;

			// permessi
			if (!this.isAdmin(ctx)) {
				if (!actorUser) {
					throw new MoleculerClientError("Unauthorized", 401, "UNAUTHORIZED");
				}
				if (ctx.params.user_id && ctx.params.user_id !== actorUser.id) {
					throw new MoleculerClientError("Forbidden", 403, "FORBIDDEN");
				}
				where.user_id = actorUser.id;
			}

			// ordinamento (whitelist)
			const allowedSort = ["created_at", "amount", "status", "method", "provider"];
			let order = [["created_at", "DESC"]];
			if (ctx.params.sort) {
				const parts = String(ctx.params.sort).split(",");
				order = parts.map(s => {
					const pair = s.trim().split(":");
					const col = pair[0] || "created_at";
					const dir = (pair[1] || "DESC").toUpperCase();
					if (!allowedSort.includes(col)) return ["created_at", "DESC"];
					return [col, dir === "ASC" ? "ASC" : "DESC"];
				});
			}

			// query
			const res = await this.Payment.findAndCountAll({
				where,
				order,
				offset: (page - 1) * pageSize,
				limit: pageSize
			});

			// emit successo
			this.broker.emit("payments.payment.listFetched", {
				actor,
				action: "payments.payment.listFetched",
				entity_type: "payment",
				entity_id: null,
				status: "ok",
				metadata: {
					page,
					pageSize,
					total: res.count
				}
			});

			// risposta (sanitizzata)
			return {
				page,
				pageSize,
				total: res.count,
				items: res.rows.map(r => this.sanitizePayment ? this.sanitizePayment(r) : r.toJSON())
			};
		} catch (err) {
			this.broker.emit("logs.record", {
				actor,
				action: "payments.payment.list",
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
				metadata: { phase: "list" }
			});

			throw this.mapSequelizeError ? this.mapSequelizeError(err, "Failed to list payments") : err;
		}
	}
};
