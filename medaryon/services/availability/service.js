"use strict";

const { Sequelize, DataTypes, Op } = require("sequelize");
const { MoleculerClientError } = require("moleculer").Errors;
const AvailabilityModel = require("./models/Availability.model.js");

// event handlers
const onUserDeleted = require("./events/users.user.deleted");
const onUserRoleChanged = require("./events/users.user.role.changed");

// azioni (oggetti) importate
const actCheckSlot = require("./actions/checkSlot");
const actCreateSlot = require("./actions/createSlot");
const actGetAvailability = require("./actions/getAvailability");
const actRemoveSlot = require("./actions/removeSlot");
const actUpdateSlot = require("./actions/updateSlot");

module.exports = {
	name: "availability",

	settings: {
		rest: "/availability",
		autoAliases: true,
		openapi: { tags: ["Availability"] }
	},

	actions: {
		checkSlot: { rest: "GET /check", ...actCheckSlot },
		createSlot: { rest: "POST /", ...actCreateSlot },
		getAvailability: { rest: "GET /doctor/:doctorId", ...actGetAvailability },
		removeSlot: { rest: "DELETE /:id", ...actRemoveSlot },
		updateSlot: { rest: "PUT /:id", ...actUpdateSlot }
	},

	// eventi in ingresso
	events: {
		"users.user.deleted": onUserDeleted,
		"users.user.role.changed": onUserRoleChanged
	},

	methods: {
		// requester
		getRequester(ctx) {
			return (ctx && ctx.meta && ctx.meta.user) ? ctx.meta.user : null;
		},

		// admin check
		isAdmin(ctx) {
			const requester = this.getRequester(ctx);
			return requester && requester.role === "admin";
		},

		// doctor check
		isDoctor(ctx) {
			const requester = this.getRequester(ctx);
			return requester && requester.role === "doctor";
		},

		// assert utility
		assert(condition, message, code = 400, type = "BAD_REQUEST", data) {
			if (!condition) throw new MoleculerClientError(message, code, type, data);
		},

		// autorizzazione dottore
		assertAuthorizedDoctor(ctx, doctorId) {
			const user = this.getRequester(ctx);
			this.assert(user, "Unauthorized", 401, "UNAUTHORIZED");
			if (this.isAdmin(ctx)) return;
			this.assert(
				user.role === "doctor" && Number(user.id) === Number(doctorId),
				"Forbidden: can only manage your own availability",
				403,
				"FORBIDDEN"
			);
		},

		// validazione intervallo orario
		validateTimeRange(start, end) {
			this.assert(start && end, "Start and end time are required", 422, "VALIDATION_ERROR");
			if (start >= end) {
				throw new MoleculerClientError(
					"start_time must be before end_time",
					422,
					"INVALID_TIME_RANGE",
					{ start_time: start, end_time: end }
				);
			}
		},

		// validazione giorno settimana
		validateDayOfWeek(day) {
			const n = Number(day);
			this.assert(Number.isInteger(n) && n >= 0 && n <= 6, "day_of_week must be between 0 and 6", 422, "VALIDATION_ERROR");
		},

		// verifica conflitti slot
		async slotConflictExists(doctorId, day, start, end, excludeId = null) {
			const where = {
				doctor_id: doctorId,
				day_of_week: day,
				start_time: { [Op.lt]: end },
				end_time: { [Op.gt]: start }
			};
			if (excludeId) where.id = { [Op.ne]: excludeId };

			const existing = await this.DoctorAvailability.findOne({ where });
			return !!existing;
		}
	},

	// lifecycle: init DB e model
	async created() {
		// lettura env
		const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
		if (!DB_USER || !DB_PASSWORD || !DB_HOST || !DB_PORT || !DB_NAME) {
			throw new Error("Missing database configuration in environment variables.");
		}

		// connessione DB
		const dbUri = "mysql://" + DB_USER + ":" + DB_PASSWORD + "@" + DB_HOST + ":" + DB_PORT + "/" + DB_NAME;
		this.logger.info("Connecting to DB at " + DB_HOST + ":" + DB_PORT + "/" + DB_NAME);

		// init sequelize
		this.sequelize = new Sequelize(dbUri, {
			logging: false,
			define: { freezeTableName: true }
		});

		// init model
		this.DoctorAvailability = AvailabilityModel(this.sequelize, DataTypes);
		await this.DoctorAvailability.sync();

		// pronto
		this.logger.info("Availability model initialized");
	}
};
