"use strict";

const { Sequelize, DataTypes } = require("sequelize");
const defineReport = require("./models/Report.model.js");

// event handlers che reports ascolta
const onApptDeleted = require("./events/appointments.appointment.deleted");
const onApptStatusChanged = require("./events/appointments.appointment.statusChanged");
const onUserDeleted = require("./events/users.user.deleted");

// importa oggetti azione
const actCreatePatient = require("./actions/createPatient");
const actCreateDoctor = require("./actions/createDoctor");
const actGet = require("./actions/get");
const actListByAppointment = require("./actions/listByAppointment");
const actUpdateVisibility = require("./actions/updateVisibility");
const actRemove = require("./actions/remove");

module.exports = {
	name: "reports",

	settings: {
		rest: "/reports",
		autoAliases: true,
		openapi: { tags: ["Reports"] }
	},

	actions: {
		createPatient: { rest: "POST /:appointmentId/patient", ...actCreatePatient },
		createDoctor: { rest: "POST /:appointmentId/doctor", ...actCreateDoctor },
		get: { rest: "GET /:id", ...actGet },
		listByAppointment: { rest: "GET /appointment/:appointmentId", ...actListByAppointment },
		updateVisibility: { rest: "PUT /:id/visibility", ...actUpdateVisibility },
		remove: { rest: "DELETE /:id", ...actRemove }
	},

	// eventi in ingresso
	events: {
		"appointments.appointment.deleted": onApptDeleted,
		"appointments.appointment.statusChanged": onApptStatusChanged,
		"users.user.deleted": onUserDeleted
	},

	methods: {
		async getAppointment(ctx, appointmentId) {
			// lettura appuntamento minimale
			try {
				return await ctx.call("appointments.get", { id: appointmentId, fields: ["id", "doctor_id", "patient_id"] });
			} catch (err) {
				// fallback null
				return null;
			}
		},

		canAccessAppointment(user, appt) {
			// controllo accesso base
			if (!appt || !user) return false;
			if (user.role === "admin") return true;
			if (user.role === "doctor" && Number(appt.doctor_id) === Number(user.id)) return true;
			if (user.role === "patient" && Number(appt.patient_id) === Number(user.id)) return true;
			return false;
		},

		canSeeReport(user, report, appt) {
			// controllo visibilita referto
			if (!user || !report) return false;
			if (user.role === "admin") return true;
			if (!this.canAccessAppointment(user, appt)) return false;

			if (user.role === "patient") {
				if (report.visible_to_patient) return true;
				if (report.author_role === "patient" && Number(report.author_id) === Number(user.id)) return true;
				return false;
			}

			if (user.role === "doctor") {
				if (report.visible_to_doctor) return true;
				if (report.author_role === "doctor" && Number(report.author_id) === Number(user.id)) return true;
				return false;
			}

			return false;
		}
	},

	async created() {
		// lettura config DB
		const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
		if (!DB_USER || !DB_PASSWORD || !DB_HOST || !DB_PORT || !DB_NAME) {
			throw new Error("Missing database configuration in environment variables.");
		}

		// connessione
		const dbUri = "mysql://" + DB_USER + ":" + DB_PASSWORD + "@" + DB_HOST + ":" + DB_PORT + "/" + DB_NAME;
		this.logger.info("Connecting to DB at " + DB_HOST + ":" + DB_PORT + "/" + DB_NAME);

		// init sequelize
		this.sequelize = new Sequelize(dbUri, {
			logging: false,
			define: { freezeTableName: true }
		});

		// init modello Report
		this.Report = defineReport(this.sequelize, DataTypes);
		await this.Report.sync();

		// ok
		this.logger.info("Report model initialized");
	}
};
