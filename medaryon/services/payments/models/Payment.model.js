"use strict";

module.exports = (sequelize, DataTypes) => {
	const Payment = sequelize.define("Payment", {
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true
		},
		user_id: {
			type: DataTypes.INTEGER,
			allowNull: false,
			references: {
				model: "users",
				key: "id"
			},
			onUpdate: "CASCADE",
			onDelete: "RESTRICT"
		},
		appointment_id: {
			type: DataTypes.INTEGER,
			allowNull: false,
			references: {
				model: "appointments",
				key: "id"
			},
			onUpdate: "CASCADE",
			onDelete: "RESTRICT"
		},
		amount: {
			type: DataTypes.DECIMAL(12, 2),
			allowNull: false,
			validate: {
				isDecimal: true,
				min: 0.01
			}
		},
		currency: {
			type: DataTypes.STRING(3),
			allowNull: false,
			defaultValue: "EUR"
		},
		method: {
			type: DataTypes.STRING(32),
			allowNull: false
		},
		status: {
			type: DataTypes.ENUM("pending", "paid", "failed", "refunded"),
			allowNull: false,
			defaultValue: "pending"
		},
		provider: {
			type: DataTypes.STRING(32),
			allowNull: true
		},
		provider_payment_id: {
			type: DataTypes.STRING(128),
			allowNull: true
		},
		metadata: {
			type: DataTypes.JSON,
			allowNull: true
		},
		paid_at: {
			type: DataTypes.DATE,
			allowNull: true
		},
		created_at: {
			type: DataTypes.DATE,
			defaultValue: DataTypes.NOW
		},
		updated_at: {
			type: DataTypes.DATE,
			defaultValue: DataTypes.NOW
		}
	}, {
		tableName: "payments",
		timestamps: true,
		underscored: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		indexes: [
			{ fields: ["user_id"] },
			{ fields: ["appointment_id"] },
			{ fields: ["status"] },
			{ fields: ["created_at"] },
			{ unique: true, fields: ["provider", "provider_payment_id"] }
		]
	});

	Payment.addHook("beforeValidate", (p) => {
		if (p.currency) p.currency = p.currency.toUpperCase();
	});

	Payment.addHook("beforeSave", (p) => {
		if (p.changed("status") && p.status === "paid" && !p.paid_at) p.paid_at = new Date();
		if (p.changed("status") && p.status !== "paid") p.paid_at = null;
	});

	return Payment;
};
