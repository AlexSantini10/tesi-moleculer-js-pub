"use strict";

const { Errors } = require("moleculer");
const { MoleculerClientError } = Errors;

module.exports = {
	auth: "required",
	params: {
		id: { type: "number", integer: true, positive: true, convert: true }
	},

	async handler(ctx) {
		const id = ctx.params.id;

		const actor = {
			id: ctx.meta && ctx.meta.user && ctx.meta.user.id ? ctx.meta.user.id : null,
			role: ctx.meta && ctx.meta.user && ctx.meta.user.role ? ctx.meta.user.role : "system"
		};

		const t = await this.DoctorAvailability.sequelize.transaction();
		try {
			const slot = await this.DoctorAvailability.findByPk(id, { transaction: t });
			if (!slot) {
				this.broker.emit("logs.record", {
					actor,
					action: "availability.slot.delete",
					entity_type: "availability_slot",
					entity_id: id,
					status: "error",
					metadata: { reason: "not_found" }
				});
				await t.rollback();
				throw new MoleculerClientError("Slot not found", 404, "NOT_FOUND");
			}

			try {
				this.assertAuthorizedDoctor(ctx, slot.doctor_id);
			} catch (authErr) {
				this.broker.emit("logs.record", {
					actor,
					action: "availability.slot.delete",
					entity_type: "availability_slot",
					entity_id: id,
					status: "error",
					metadata: { reason: "forbidden", doctor_id: slot.doctor_id }
				});
				await t.rollback();
				throw authErr;
			}

			const meta = {
				doctor_id: slot.doctor_id,
				day_of_week: slot.day_of_week,
				start_time: slot.start_time,
				end_time: slot.end_time
			};

			await slot.destroy({ transaction: t });
			await t.commit();

			// evento dominio
			this.broker.emit("availability.slot.deleted", {
				actor,
				action: "availability.slot.deleted",
				entity_type: "availability_slot",
				entity_id: id,
				status: "ok",
				metadata: meta
			});

			// log record di successo
			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.delete",
				entity_type: "availability_slot",
				entity_id: id,
				status: "ok",
				metadata: meta
			});

			return { id, deleted: true };
		} catch (err) {
			try { await t.rollback(); } catch (_) {
				// ignore rollback error
			}

			this.broker.emit("logs.record", {
				actor,
				action: "availability.slot.delete",
				entity_type: "availability_slot",
				entity_id: id,
				status: "error",
				metadata: { message: err.message, code: err.code ? err.code : null }
			});
			this.logger.error("Delete availability slot failed", err);

			if (err.name === "SequelizeForeignKeyConstraintError") {
				throw new MoleculerClientError("Slot is referenced by other records", 409, "FK_CONSTRAINT");
			}

			throw this.mapSequelizeError(err, "Failed to delete availability slot");
		}
	}
};
