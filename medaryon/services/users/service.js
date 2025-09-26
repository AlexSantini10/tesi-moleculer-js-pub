"use strict";

const { Sequelize, DataTypes } = require("sequelize");
const UserModel = require("./models/User.model.js");

// importa gli oggetti azione
const actList = require("./actions/list");
const actGet = require("./actions/get");
const actRegister = require("./actions/register");
const actUpdate = require("./actions/update");
const actDelete = require("./actions/delete");
const actChangePassword = require("./actions/changePassword");
const actMe = require("./actions/me");
const actForgotPassword = require("./actions/forgotPassword");
const actResetPassword = require("./actions/resetPassword");
const actLogin = require("./actions/login");
const actLogout = require("./actions/logout");

module.exports = {
	name: "users",

	settings: {
		rest: "/users",
		autoAliases: true,
		openapi: { tags: ["Users"] }
	},

	actions: {
		list: { rest: "GET /", ...actList },
		get: { rest: "GET /:id", ...actGet },
		register: { rest: "POST /register", ...actRegister },
		update: { rest: "PUT /:id", ...actUpdate },
		delete: { rest: "DELETE /:id", ...actDelete },
		changePassword: { rest: "PUT /password", ...actChangePassword },
		me: { rest: "GET /me", ...actMe },
		forgotPassword: { rest: "POST /password/forgot", ...actForgotPassword },
		resetPassword: { rest: "POST /password/reset", ...actResetPassword },
		login: { rest: "POST /login", ...actLogin },
		logout: { rest: "POST /logout", ...actLogout }
	},

	async created() {
		const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
		if (!DB_USER || !DB_PASSWORD || !DB_HOST || !DB_PORT || !DB_NAME) {
			throw new Error("Missing database configuration in environment variables.");
		}

		const dbUri = "mysql://" + DB_USER + ":" + DB_PASSWORD + "@" + DB_HOST + ":" + DB_PORT + "/" + DB_NAME;
		this.logger.info("Connecting to DB at " + DB_HOST + ":" + DB_PORT + "/" + DB_NAME);

		this.sequelize = new Sequelize(dbUri, {
			logging: false,
			define: { freezeTableName: true }
		});

		this.User = UserModel(this.sequelize, DataTypes);
		await this.User.sync();

		this.logger.info("User model initialized");
		this.passwordResetTokens = {};
	}
};
