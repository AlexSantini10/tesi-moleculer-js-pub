"use strict";

module.exports = (sequelize, DataTypes) => {
	return sequelize.define("Appointment", {
		id: {
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true
		},
		patient_id: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		doctor_id: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		scheduled_at: {
			type: DataTypes.DATE,
			allowNull: false
		},
		status: {
			type: DataTypes.ENUM("requested", "confirmed", "cancelled", "completed"),
			allowNull: false,
			defaultValue: "requested"
		},
		notes: {
			type: DataTypes.TEXT,
			allowNull: true
		},
		created_at: {
			type: DataTypes.DATE,
			defaultValue: DataTypes.NOW
		}
	}, {
		tableName: "appointments",
		timestamps: false,
		indexes: [
			{ unique: true, fields: ["doctor_id", "scheduled_at"] },
			{ fields: ["patient_id", "scheduled_at"] },
			{ fields: ["status"] }
		]
	});
};
