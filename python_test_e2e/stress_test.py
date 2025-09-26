#!/usr/bin/env python3

import os
import time
import json
import uuid
import urllib.request
import urllib.error
import unittest
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = os.environ.get("MEDARYON_BASE_URL", "http://localhost:3000").rstrip("/")

NUM_USERS = int(os.environ.get("NUM_USERS", "50"))

def _json(obj):
	return json.dumps(obj).encode("utf-8")

def _headers(token=None, extra=None):
	h = {
		"Accept": "application/json",
		"Content-Type": "application/json"
	}
	if token:
		h["Authorization"] = "Bearer " + token
	if extra:
		h.update(extra)
	return h

def _request(method, path, token=None, data=None, timeout=10):
	url = BASE_URL + path
	body = None
	if data is not None:
		body = _json(data) if not isinstance(data, (bytes, bytearray)) else data
	req = urllib.request.Request(url, data=body, headers=_headers(token), method=method)
	with urllib.request.urlopen(req, timeout=timeout) as resp:
		ct = resp.headers.get("Content-Type", "")
		raw = resp.read()
		if "application/json" in ct:
			return resp.getcode(), json.loads(raw.decode("utf-8") or "{}")
		return resp.getcode(), raw

def _create_user(role):
	email = f"{role[:1]}+{uuid.uuid4().hex[:10]}@test.local"
	payload = {
		"email": email,
		"password": "P4ssw0rd!",
		"role": role,
		"first_name": role.capitalize(),
		"last_name": "Perf"
	}
	code, body = _request("POST", "/api/users/users", data=payload)
	if code not in (200, 201):
		raise RuntimeError(f"Errore creazione utente {role}: {body}")
	uid = body.get("id") or body.get("user", {}).get("id")
	return email, payload["password"], uid

def _login(email, password):
	code, body = _request("POST", "/api/users/login", data={"email": email, "password": password})
	if code != 200:
		raise RuntimeError(f"Login fallito: {body}")
	return body.get("token") or body.get("access_token") or body.get("jwt")

def _create_availability(doctor_id, token, dow=1, start="09:00", end="17:00"):
	payload = {
		"doctor_id": doctor_id,
		"day_of_week": dow,
		"start_time": start,
		"end_time": end
	}
	code, body = _request("POST", "/api/availability", token=token, data=payload)
	if code not in (200, 201):
		raise RuntimeError(f"Errore creazione availability: {body}")
	return body.get("id")

def _unique_time(offset_minutes=0):
	ts = time.time() + 86400 + offset_minutes * 60
	return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))

class TestPerformance(unittest.TestCase):

	def test_1_users_create_and_update(self):
		"""Misura tempi separati: creazione e update utenti"""
		create_times, update_times = [], []

		def worker(i):
			# create
			start = time.perf_counter()
			email, pwd, uid = _create_user("patient")
			create_elapsed = time.perf_counter() - start

			# update con TUTTI i campi richiesti
			token = _login(email, pwd)
			payload = {
				"email": email,
				"password": pwd,
				"role": "patient",
				"first_name": "Changed",
				"last_name": f"User{i}"
			}
			start = time.perf_counter()
			code, body = _request("PUT", f"/api/users/{uid}", token=token, data=payload)
			update_elapsed = time.perf_counter() - start
			return code, create_elapsed, update_elapsed

		with ThreadPoolExecutor(max_workers=20) as ex:
			for f in as_completed([ex.submit(worker, i) for i in range(NUM_USERS)]):
				code, c_time, u_time = f.result()
				self.assertIn(code, (200, 201))
				create_times.append(c_time)
				update_times.append(u_time)

		print(f"\nUser create avg ({NUM_USERS} parallel): {sum(create_times)/len(create_times)} s")
		print(f"User update avg ({NUM_USERS} parallel): {sum(update_times)/len(update_times)} s")

	def test_2_availability_create_and_update(self):
		"""Misura tempi separati: creazione e update availability"""
		create_times, update_times = [], []

		def worker(i):
			email_d, pwd_d, did = _create_user("doctor")
			token_d = _login(email_d, pwd_d)

			# create
			start = time.perf_counter()
			aid = _create_availability(did, token_d, dow=i % 7)
			create_elapsed = time.perf_counter() - start

			# update con TUTTI i campi richiesti
			payload = {
				"doctor_id": did,
				"day_of_week": i % 7,
				"start_time": "08:00",
				"end_time": "16:00"
			}
			start = time.perf_counter()
			code, body = _request("PUT", f"/api/availability/{aid}", token=token_d, data=payload)
			update_elapsed = time.perf_counter() - start
			return code, create_elapsed, update_elapsed

		with ThreadPoolExecutor(max_workers=20) as ex:
			for f in as_completed([ex.submit(worker, i) for i in range(NUM_USERS)]):
				code, c_time, u_time = f.result()
				self.assertIn(code, (200, 201))
				create_times.append(c_time)
				update_times.append(u_time)

		print(f"\nAvailability create avg ({NUM_USERS} parallel): {sum(create_times)/len(create_times)} s")
		print(f"Availability update avg ({NUM_USERS} parallel): {sum(update_times)/len(update_times)} s")

	def test_3_appointments_create_and_update(self):
		"""Misura tempi separati: creazione e update appuntamenti"""
		create_times, update_times = [], []

		def worker(i):
			email_p, pwd_p, pid = _create_user("patient")
			email_d, pwd_d, did = _create_user("doctor")
			token_p = _login(email_p, pwd_p)
			token_d = _login(email_d, pwd_d)
			_create_availability(did, token_d)

			# create
			payload = {
				"patient_id": pid,
				"doctor_id": did,
				"scheduled_at": _unique_time(i),
				"start_time": "09:00",
				"end_time": "09:30"
			}
			start = time.perf_counter()
			code, body = _request("POST", "/api/appointments", token=token_p, data=payload)
			create_elapsed = time.perf_counter() - start
			self.assertIn(code, (200, 201), msg=str(body))
			aid = body.get("id") or body.get("appointment", {}).get("id")

			# update status (se il service richiede solo status)
			payload = {"status": "confirmed"}
			start = time.perf_counter()
			code, body = _request("PUT", f"/api/appointments/{aid}/status", token=token_d, data=payload)
			update_elapsed = time.perf_counter() - start
			return code, create_elapsed, update_elapsed

		with ThreadPoolExecutor(max_workers=20) as ex:
			for f in as_completed([ex.submit(worker, i) for i in range(NUM_USERS)]):
				code, c_time, u_time = f.result()
				self.assertIn(code, (200, 201))
				create_times.append(c_time)
				update_times.append(u_time)

		print(f"\nAppointment create avg ({NUM_USERS} parallel): {sum(create_times)/len(create_times)} s")
		print(f"Appointment update avg ({NUM_USERS} parallel): {sum(update_times)/len(update_times)} s")

if __name__ == "__main__":
	unittest.main(verbosity=2, failfast=True)
