#!/usr/bin/env python3

import os
import time
import statistics
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

# Endpoint di default = helloWorld
BASE_URL = os.environ.get("HELLO_URL", "http://localhost:3000/api/hello")
CONCURRENCY = int(os.environ.get("CONCURRENCY", "2000"))
REQUESTS = int(os.environ.get("REQUESTS", "50000"))


def worker(i):
    # aggiungo query param così evitiamo cache/CDN
    url = f"{BASE_URL}"
    start = time.time()
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            latency = time.time() - start
            return latency, resp.status
    except Exception:
        latency = time.time() - start
        return latency, None


def run_test():
    results = []
    start = time.time()

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures = [ex.submit(worker, i) for i in range(REQUESTS)]
        for f in as_completed(futures):
            results.append(f.result())

    total_time = time.time() - start

    # metriche
    latencies = [r[0] for r in results if r[1] == 200]
    errors = [r for r in results if r[1] != 200]

    print("\n=== HELLO WORLD STRESS TEST ===")
    print(f"Target: {BASE_URL}")
    print(f"Requests: {REQUESTS}")
    print(f"Concurrency: {CONCURRENCY}")
    print(f"Total time: {total_time:.2f}s")
    if latencies:
        print(f"Mean latency: {statistics.mean(latencies):.6f}s")
        print(f"Stddev latency: {statistics.pstdev(latencies):.6f}s")
        print(f"Min latency: {min(latencies):.6f}s")
        print(f"Max latency: {max(latencies):.6f}s")
    print(f"Throughput: {REQUESTS/total_time:.2f} req/s")
    print(f"Errors: {len(errors)}")


if __name__ == "__main__":
    run_test()
