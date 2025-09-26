#!/usr/bin/env python3

import os
import json
import time
import uuid
import urllib.request
import urllib.error
import unittest
from urllib.parse import urlencode, quote

BASE_URL = os.environ.get("MEDARYON_BASE_URL", "http://localhost:3000").rstrip("/")

DEFAULT_TIMEOUT = 12
RETRY_COUNT = 2
BACKOFF = 0.4

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

def _request(method, path, token=None, data=None, timeout=DEFAULT_TIMEOUT):
	url = BASE_URL + path
	body = None
	if data is not None:
		body = _json(data) if not isinstance(data, (bytes, bytearray)) else data
	last_err = None
	for attempt in range(1, RETRY_COUNT + 2):
		try:
			req = urllib.request.Request(url, data=body, headers=_headers(token), method=method)
			with urllib.request.urlopen(req, timeout=timeout) as resp:
				ct = resp.headers.get("Content-Type", "")
				raw = resp.read()
				if "application/json" in ct:
					return resp.getcode(), json.loads(raw.decode("utf-8") or "{}")
				return resp.getcode(), raw
		except urllib.error.HTTPError as e:
			ct = e.headers.get("Content-Type", "") if e.headers else ""
			raw = e.read()
			if "application/json" in ct:
				try:
					return e.code, json.loads(raw.decode("utf-8") or "{}")
				except Exception:
					return e.code, {"error": raw.decode("utf-8", "ignore")}
			return e.code, {"error": raw.decode("utf-8", "ignore")}
		except urllib.error.URLError as e:
			last_err = e
			if attempt >= RETRY_COUNT + 1:
				raise
			time.sleep(BACKOFF * attempt)
	return 599, {"error": str(last_err) if last_err else "unknown"}

def _rand_email():
	return "u+" + uuid.uuid4().hex[:10] + "@test.local"

def _now_rfc3339_in(seconds):
	return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + seconds))

def _extract_id(obj):
	if isinstance(obj, dict):
		for k in ("id", "_id", "appointment_id", "payment_id"):
			if k in obj:
				return obj[k]
	return None

class TestMedaryonE2E(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		cls.state = {
			"tokens": {},
			"users": {},
			"availability": {},
			"appointment": {},
			"reports": [],
			"payment": {}
		}

	# USERS

	def test_01_register_patient(self):
		payload = {
			"email": _rand_email(),
			"password": "P4ssw0rd!",
			"role": "patient",
			"first_name": "Mario",
			"last_name": "Rossi"
		}
		code, body = _request("POST", "/api/users/users", data=payload)
		self.assertIn(code, (200, 201), msg=str(body))
		patient_id = _extract_id(body) or body.get("user", {}).get("id")
		self.assertIsNotNone(patient_id, msg=str(body))
		self.__class__.state["users"]["patient"] = {
			"id": patient_id,
			"email": payload["email"],
			"password": payload["password"]
		}

	def test_02_register_doctor(self):
		payload = {
			"email": _rand_email(),
			"password": "P4ssw0rd!",
			"role": "doctor",
			"first_name": "Giulia",
			"last_name": "Bianchi"
		}
		code, body = _request("POST", "/api/users/users", data=payload)
		self.assertIn(code, (200, 201), msg=str(body))
		doctor_id = _extract_id(body) or body.get("user", {}).get("id")
		self.assertIsNotNone(doctor_id, msg=str(body))
		self.__class__.state["users"]["doctor"] = {
			"id": doctor_id,
			"email": payload["email"],
			"password": payload["password"]
		}

	def test_03_login_patient(self):
		u = self.__class__.state["users"]["patient"]
		payload = {"email": u["email"], "password": u["password"]}
		code, body = _request("POST", "/api/users/login", data=payload)
		self.assertEqual(code, 200, msg=str(body))
		token = body.get("token") or body.get("access_token") or body.get("jwt")
		self.assertIsNotNone(token, msg=str(body))
		self.__class__.state["tokens"]["patient"] = token

	def test_04_login_doctor(self):
		u = self.__class__.state["users"]["doctor"]
		payload = {"email": u["email"], "password": u["password"]}
		code, body = _request("POST", "/api/users/login", data=payload)
		self.assertEqual(code, 200, msg=str(body))
		token = body.get("token") or body.get("access_token") or body.get("jwt")
		self.assertIsNotNone(token, msg=str(body))
		self.__class__.state["tokens"]["doctor"] = token

	def test_05_users_me(self):
		code, body = _request("GET", "/api/users/me", token=self.__class__.state["tokens"]["patient"])
		self.assertEqual(code, 200, msg=str(body))
		self.assertTrue(isinstance(body, dict), msg=str(body))

	# AVAILABILITY

	def test_06_create_availability_slot(self):
		doc = self.__class__.state["users"]["doctor"]
		token = self.__class__.state["tokens"]["doctor"]
		payload = {
			"doctor_id": int(doc["id"]),
			"day_of_week": 2,          # 0=Lunedì, 1=Martedì... (dipende dal backend)
			"start_time": "09:00",     # formato HH:MM
			"end_time": "12:00"        # formato HH:MM
		}
		code, body = _request("POST", "/api/availability", token=token, data=payload)
		self.assertIn(code, (200, 201), msg=str(body))
		slot_id = _extract_id(body)
		if slot_id:
			self.__class__.state["availability"]["slot_id"] = slot_id

	def test_07_get_availability_for_doctor(self):
		doc = self.__class__.state["users"]["doctor"]
		token = self.__class__.state["tokens"]["patient"]
		q = "?doctor_id=" + quote(str(doc["id"]))
		path = "/api/availability/doctor/" + quote(str(doc["id"])) + q
		code, body = _request("GET", path, token=token)
		self.assertEqual(code, 200, msg=str(body))

	# APPOINTMENTS

	def test_08_create_appointment(self):
		p = self.__class__.state["users"]["patient"]
		d = self.__class__.state["users"]["doctor"]
		token = self.__class__.state["tokens"]["patient"]

		# scheduled_at: giorno +1
		sched = _now_rfc3339_in(86400)

		payload = {
			"patient_id": int(p["id"]),
			"doctor_id": int(d["id"]),
			"scheduled_at": sched,
			"start_time": "09:00",
			"end_time": "09:30",
			"notes": "Controllo"
		}

		code, body = _request("POST", "/api/appointments", token=token, data=payload)
		self.assertIn(code, (200, 201), msg=str(body))
		appt_id = _extract_id(body)
		self.assertIsNotNone(appt_id, msg=str(body))
		self.__class__.state["appointment"]["id"] = appt_id

	def test_09_get_appointment(self):
		token = self.__class__.state["tokens"]["patient"]
		appt_id = self.__class__.state["appointment"]["id"]
		path = "/api/appointments/" + quote(str(appt_id))
		code, body = _request("GET", path, token=token)
		self.assertEqual(code, 200, msg=str(body))

	def test_10_set_appointment_status_confirmed(self):
		token = self.__class__.state["tokens"]["doctor"]
		appt_id = self.__class__.state["appointment"]["id"]
		path = "/api/appointments/" + quote(str(appt_id)) + "/status"
		payload = {"status": "confirmed"}
		code, body = _request("PUT", path, token=token, data=payload)
		self.assertEqual(code, 200, msg=str(body))

	def test_11_reschedule_appointment(self):
		token = self.__class__.state["tokens"]["doctor"]
		appt_id = self.__class__.state["appointment"]["id"]
		path = "/api/appointments/" + quote(str(appt_id)) + "/reschedule"
		payload = {"new_date": _now_rfc3339_in(172800)}
		code, body = _request("PUT", path, token=token, data=payload)
		self.assertEqual(code, 200, msg=str(body))

	# REPORTS

	def test_12_create_doctor_report(self):
		token = self.__class__.state["tokens"]["doctor"]
		appt_id = self.__class__.state["appointment"]["id"]
		payload = {
			"appointmentId": int(appt_id),
			"reportUrl": "https://example.com/report/" + uuid.uuid4().hex,
			"title": "Referto visita",
			"notes": "Esito ok",
			"mimeType": "application/pdf",
			"sizeBytes": 12345,
			"visibleToPatient": True
		}
		code, body = _request("POST", "/api/reports/reports/doctor", token=token, data=payload)
		self.assertIn(code, (200, 201), msg=str(body))
		report_id = _extract_id(body)
		self.assertIsNotNone(report_id, msg=str(body))
		self.__class__.state["reports"].append(report_id)

	def test_13_list_reports_by_appointment(self):
		token = self.__class__.state["tokens"]["patient"]
		appt_id = self.__class__.state["appointment"]["id"]
		path = "/api/reports/appointments/" + quote(str(appt_id)) + "/reports"
		code, body = _request("GET", path, token=token)
		self.assertEqual(code, 200, msg=str(body))

	# PAYMENTS

	def test_14_create_payment(self):
		token = self.__class__.state["tokens"]["patient"]
		p = self.__class__.state["users"]["patient"]
		appt_id = self.__class__.state["appointment"]["id"]
		payload = {
			"user_id": int(p["id"]),
			"appointment_id": int(appt_id),
			"amount": "50.00",
			"currency": "EUR",
			"method": "card",
			"provider": "test",
			"provider_payment_id": "pay_" + uuid.uuid4().hex[:12]
		}
		code, body = _request("POST", "/api/payments", token=token, data=payload)
		self.assertIn(code, (200, 201), msg=str(body))
		payment_id = _extract_id(body)
		self.assertIsNotNone(payment_id, msg=str(body))
		self.__class__.state["payment"]["id"] = payment_id

	def test_15_mark_payment_paid(self):
		token = self.__class__.state["tokens"]["doctor"]
		payment_id = self.__class__.state["payment"]["id"]
		path = "/api/payments/" + quote(str(payment_id)) + "/mark-paid"
		code, body = _request("POST", path, token=token, data={})
		self.assertEqual(code, 200, msg=str(body))

	def test_16_update_payment_status(self):
		token = self.__class__.state["tokens"]["doctor"]
		payment_id = self.__class__.state["payment"]["id"]
		path = "/api/payments/" + quote(str(payment_id)) + "/status"
		payload = {"status": "paid"}
		code, body = _request("PATCH", path, token=token, data=payload)
		self.assertEqual(code, 200, msg=str(body))

	# LOGS

	def test_17_create_log(self):
		token = self.__class__.state["tokens"]["doctor"]
		doc = self.__class__.state["users"]["doctor"]
		appt_id = self.__class__.state["appointment"]["id"]
		payload = {
			"actor_id": int(doc["id"]),
			"actor_role": "doctor",
			"action": "appointment.update",
			"entity_type": "appointment",
			"entity_id": int(appt_id),
			"status": "ok",
			"metadata": {"info": "status updated"}
		}
		code, body = _request("POST", "/api/logs", token=token, data=payload)
		self.assertIn(code, (200, 201), msg=str(body))
		log_id = _extract_id(body)
		if log_id:
			self.__class__.state["last_log_id"] = log_id

	def test_18_list_logs(self):
		token = self.__class__.state["tokens"]["doctor"]
		doc = self.__class__.state["users"]["doctor"]
		q = urlencode({"actor_id": int(doc["id"]), "limit": 10})
		code, body = _request("GET", "/api/logs?" + q, token=token)
		self.assertEqual(code, 200, msg=str(body))

if __name__ == "__main__":
	# failfast=True blocca alla prima failure; verbosity=2 mostra i nomi dei test
	unittest.main(verbosity=2, failfast=True, buffer=False)
