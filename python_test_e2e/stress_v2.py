#!/usr/bin/env python3

import os
import json
import time
import uuid
import signal
import sys
import statistics
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

BASE_URL = os.environ.get("MEDARYON_BASE_URL", "http://localhost:3000/api").rstrip("/")
CONCURRENCY = int(os.environ.get("CONCURRENCY", "1000"))
REQUESTS = int(os.environ.get("REQUESTS", "10000"))

PASSWORD = "password123"
DOCTOR_TOKEN = None
DOCTOR_ID = None
PATIENT_TOKEN = None
PATIENT_ID = None


def _headers(token=None):
	h = {"Accept": "application/json", "Content-Type": "application/json"}
	if token:
		h["Authorization"] = "Bearer " + token
	return h


def _request(path, method="GET", payload=None, token=None):
	url = BASE_URL + path
	body = None
	if payload:
		body = json.dumps(payload).encode("utf-8")
	req = urllib.request.Request(url, data=body, headers=_headers(token), method=method)
	start = time.time()
	try:
		with urllib.request.urlopen(req, timeout=10) as resp:
			data = resp.read()
			latency = time.time() - start
			return latency, resp.status, data.decode()
	except Exception as e:
		latency = time.time() - start
		return latency, None, str(e)


def register_user(role):
	email = f"{role}_{uuid.uuid4().hex[:8]}@mail.com"
	payload = {
		"email": email,
		"password": PASSWORD,
		"role": role,
		"first_name": role.capitalize(),
		"last_name": "Stress"
	}
	lat_reg, code, data = _request("/users/users", "POST", payload)
	if code != 200:
		raise RuntimeError(f"User registration failed ({role}) with code {code}: {data}")
	try:
		j = json.loads(data)
		user_id = j.get("id") or j.get("user", {}).get("id")
	except:
		user_id = None
	lat_login, code, data = _request("/users/login", "POST", {"email": email, "password": PASSWORD})
	if code == 200:
		j = json.loads(data)
		token = j.get("token") or j.get("access_token")
		return token, user_id, lat_reg, lat_login
	else:
		raise RuntimeError(f"Login failed for {role}: {code}, {data}")


def setup_doctor():
	global DOCTOR_TOKEN, DOCTOR_ID
	DOCTOR_TOKEN, DOCTOR_ID, lat_reg, lat_login = register_user("doctor")
	payload = {
		"doctor_id": DOCTOR_ID or 1,
		"day_of_week": 1,
		"start_time": "09:00",
		"end_time": "17:00"
	}
	lat_av, code, data = _request("/availability", "POST", payload, token=DOCTOR_TOKEN)
	if code != 200:
		raise RuntimeError(f"Failed to create availability: {code}, {data}")
	return lat_reg, lat_login, lat_av


def setup_patient():
	global PATIENT_TOKEN, PATIENT_ID
	PATIENT_TOKEN, PATIENT_ID, lat_reg, lat_login = register_user("patient")
	return lat_reg, lat_login


def unique_time(i, step_minutes=30):
	when = datetime.utcnow() + timedelta(days=1, minutes=i * step_minutes)
	return when.isoformat() + "Z"


def worker_appointment(i):
	payload = {
		"patient_id": PATIENT_ID or 1,
		"doctor_id": DOCTOR_ID or 1,
		"scheduled_at": unique_time(i),
		"notes": f"stress appointment {i}"
	}
	return _request("/appointments", "POST", payload, token=PATIENT_TOKEN)


def worker_availability(i):
	payload = {
		"doctor_id": DOCTOR_ID or 1,
		"day_of_week": i % 7,
		"start_time": f"{8 + (i % 8):02d}:00",
		"end_time": f"{9 + (i % 8):02d}:00"
	}
	return _request("/availability", "POST", payload, token=DOCTOR_TOKEN)


def worker_users(i):
	email = f"user_{uuid.uuid4().hex[:8]}@mail.com"
	payload = {"email": email, "password": PASSWORD, "role": "patient",
			   "first_name": "User", "last_name": str(i)}
	lat_reg, code_reg, data_reg = _request("/users/users", "POST", payload)
	lat_login, code_login, data_login = _request("/users/login", "POST", {"email": email, "password": PASSWORD})
	ok = (code_reg == 200 and code_login == 200)
	return (lat_reg + lat_login, 200 if ok else code_login or code_reg,
			f"register={code_reg}, login={code_login}")


def run_stress(name, worker):
	results = []
	start = time.time()
	with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
		futures = [ex.submit(worker, i) for i in range(REQUESTS)]
		for f in as_completed(futures):
			results.append(f.result())
	total_time = time.time() - start

	latencies = [r[0] for r in results if r[1] == 200]
	errors = [r for r in results if r[1] != 200]

	print(f"\n=== {name.upper()} STRESS TEST ===")
	print(f"Requests: {REQUESTS}")
	print(f"Concurrency: {CONCURRENCY}")
	print(f"Total time: {total_time:.2f}s")
	if latencies:
		print(f"Mean latency: {statistics.mean(latencies):.4f}s")
		print(f"Stddev latency: {statistics.pstdev(latencies):.4f}s")
		print(f"Min latency: {min(latencies):.4f}s")
		print(f"Max latency: {max(latencies):.4f}s")
	print(f"Throughput: {REQUESTS/total_time:.2f} req/s")
	print(f"Errors: {len(errors)}")

	if errors:
		print("\n=== ERROR LOGS ===")
		for i, e in enumerate(errors[:20], 1):
			lat, code, msg = e
			print(f"[{i}] code={code}, latency={lat:.4f}s, msg={msg}")


def main():
	d_reg, d_login, d_av = setup_doctor()
	p_reg, p_login = setup_patient()

	print("=== USERS CREATION ===")
	print(f"Doctor register: {d_reg:.4f}s, login: {d_login:.4f}s")
	print(f"Patient register: {p_reg:.4f}s, login: {p_login:.4f}s")

	print("\n=== AVAILABILITY CREATION (BASE) ===")
	print(f"Doctor availability: {d_av:.4f}s")

	run_stress("Users", worker_users)
	run_stress("Availability", worker_availability)
	run_stress("Appointments", worker_appointment)


# Gestione CTRL+C
def handle_sigint(sig, frame):
	print("\n\n>>> Interruzione rilevata, chiusura in corso...")
	sys.exit(0)


if __name__ == "__main__":
	signal.signal(signal.SIGINT, handle_sigint)
	main()
