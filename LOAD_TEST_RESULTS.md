# Isolated load test results

Run: 2026-10-13T11:16:07.501Z

Production data was not accessed. The test created a temporary local MongoDB instance and bound the API to loopback. No .env files or production database connector were used.

## Workload

10 instructors, 200 panels, 40 blocks, 400 groups and 2,000 seeded evaluations. MongoDB pool: 10, matching the application. Production response caching enabled. Users browse groups, load rubric and existing scores, submit scores; 10% view instructor results. One-second pause between cycles. Tokens were generated before measurement.

| Scenario | Users | Requests | Errors | Requests/s | Median ms | P95 ms | P99 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mixed grading (1s between cycles) | 10 | 519 | 0 | 32.4 | 35 | 75 | 99 |
| mixed grading (1s between cycles) | 25 | 1210 | 0 | 75.5 | 59 | 137 | 164 |
| mixed grading (1s between cycles) | 50 | 2074 | 0 | 128.1 | 129 | 267 | 338 |
| mixed grading (1s between cycles) | 100 | 3306 | 0 | 199.3 | 265 | 467 | 553 |
| mixed grading (1s between cycles) | 200 | 4145 | 0 | 242.6 | 654 | 1005 | 1158 |
| simultaneous grade submissions | 200 | 200 | 0 | 212 | 905 | 932 | 934 |

P95 means 95% of measured requests completed within this time. Burst throughput covers the duration of the single burst, not sustainable throughput.

## Integrity

Verified 1490 saved grade records against successful writes. Missing: 0; duplicates: 0; incorrect scores: 0. Total evaluation count remained 2,000.

## Environment and limits

AMD Ryzen 5 5600G with Radeon Graphics         ; 12 logical CPUs; 15.8 GiB RAM; Node v24.14.1.

- Local API, local MongoDB and load generator share one computer/process; not a Render/Atlas capacity benchmark.
- Short 15-second stages; not a sustained soak test or browser-rendering test.
- Preauthenticated users; login spikes, uploads, exports and production network latency are excluded.
- Each panel sends 4 requests per grading cycle with a 1-second pause; 10% of simulated users view instructor results.

Detailed per-endpoint metrics: back-end/test/load-test-results.json. The temporary database and API are stopped after completion.
