"use strict";

module.exports = (sequelize, DataTypes) => {
	return sequelize.define("Notification", {
		id: {
			type: DataTypes.INTEGER.UNSIGNED,
			autoIncrement: true,
			primaryKey: true
		},
		user_id: {
			type: DataTypes.INTEGER.UNSIGNED,
			allowNull: false
		},
		message: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		channel: {
			type: DataTypes.STRING(50),
			allowNull: false
		},
		status: {
			type: DataTypes.ENUM("pending", "sent", "failed"),
			allowNull: false,
			defaultValue: "pending"
		},
		sent_at: {
			type: DataTypes.DATE,
			allowNull: true
		},
		created_at: {
			type: DataTypes.DATE,
			defaultValue: DataTypes.NOW
		}
	}, {
		tableName: "notifications",
		timestamps: false,
		indexes: [
			{ fields: ["user_id"] },
			{ fields: ["status"] },
			{ fields: ["channel"] },
			{ fields: ["created_at"] }
		]
	});
};
