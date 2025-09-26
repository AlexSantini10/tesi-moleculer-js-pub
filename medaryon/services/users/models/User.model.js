"use strict";

module.exports = (sequelize, DataTypes) => {
	return sequelize.define("User", {
		id: {
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true
		},
		email: {
			type: DataTypes.STRING(100),
			allowNull: false,
			unique: true
		},
		password: {
			type: DataTypes.STRING(255),
			allowNull: false
		},
		role: {
			type: DataTypes.ENUM("patient", "doctor", "admin"),
			allowNull: false
		},
		first_name: DataTypes.STRING(100),
		last_name: DataTypes.STRING(100),
		created_at: {
			type: DataTypes.DATE,
			defaultValue: DataTypes.NOW
		}
	}, {
		tableName: "users",
		timestamps: false,
		indexes: [
			{ unique: true, fields: ["email"] }
		]
	});
};
