module.exports = (sequelize, DataTypes) => {
	return sequelize.define("DoctorAvailability", {
		id: {
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true
		},
		doctor_id: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		day_of_week: {
			type: DataTypes.TINYINT,
			allowNull: false,
			validate: {
				min: 0,
				max: 6
			}
		},
		start_time: {
			type: DataTypes.TIME,
			allowNull: false
		},
		end_time: {
			type: DataTypes.TIME,
			allowNull: false
		}
	}, {
		tableName: "doctor_availability",
		timestamps: false
	});
};
