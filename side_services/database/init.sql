CREATE DATABASE IF NOT EXISTS medaryon CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE medaryon;

-- Utenti
CREATE TABLE users (
	id INT AUTO_INCREMENT PRIMARY KEY,
	email VARCHAR(100) NOT NULL UNIQUE,
	password VARCHAR(255) NOT NULL,
	role ENUM('patient', 'doctor', 'admin') NOT NULL,
	first_name VARCHAR(100),
	last_name VARCHAR(100),
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Disponibilità settimanale dei medici
CREATE TABLE doctor_availability (
	id INT AUTO_INCREMENT PRIMARY KEY,
	doctor_id INT NOT NULL,
	day_of_week TINYINT NOT NULL,
	start_time TIME NOT NULL,
	end_time TIME NOT NULL,
	FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX (doctor_id)
) ENGINE=InnoDB;

-- Appuntamenti
CREATE TABLE appointments (
	id INT AUTO_INCREMENT PRIMARY KEY,
	patient_id INT NOT NULL,
	doctor_id INT NOT NULL,
	scheduled_at DATETIME NOT NULL,
	status ENUM('requested', 'confirmed', 'cancelled', 'completed') NOT NULL DEFAULT 'requested',
	notes TEXT,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX (patient_id),
	INDEX (doctor_id),
	INDEX (scheduled_at)
) ENGINE=InnoDB;

-- Referti
CREATE TABLE reports (
	id INT AUTO_INCREMENT PRIMARY KEY,
	appointment_id INT NOT NULL,
	report_url TEXT NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
	INDEX (appointment_id)
) ENGINE=InnoDB;

-- Notifiche
CREATE TABLE notifications (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	message TEXT NOT NULL,
	channel VARCHAR(50) NOT NULL,
	status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
	sent_at DATETIME DEFAULT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX (user_id),
	INDEX (status),
	INDEX (channel)
) ENGINE=InnoDB;

-- Pagamenti
CREATE TABLE payments (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	appointment_id INT NOT NULL,
	amount DECIMAL(8,2) NOT NULL,
	method VARCHAR(50) NOT NULL,
	status ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending',
	paid_at DATETIME DEFAULT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
	INDEX (user_id),
	INDEX (appointment_id),
	INDEX (status)
) ENGINE=InnoDB;

-- Log attività
CREATE TABLE activity_logs (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	action VARCHAR(100) NOT NULL,
	target_type VARCHAR(50) NOT NULL,
	target_id INT NOT NULL,
	timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	INDEX (user_id),
	INDEX (target_type),
	INDEX (target_id)
) ENGINE=InnoDB;
