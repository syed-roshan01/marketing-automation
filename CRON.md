Cron job for keepalive (cron-job.org)
===================================

Use this to keep the backend awake by pinging the `/health` endpoint.

Service URL to ping (GET):

https://marketing-automation-kc2t.onrender.com/health

Recommended cron-job.org settings
- URL: https://marketing-automation-kc2t.onrender.com/health
- Method: GET
- Retries: 3 (use the UI option to retry on failure)
- Timeout: 10 seconds
- HTTP Headers: none required
- Success status codes: 200
- Interval: 1 minute (if your cron service allows; otherwise choose 2 or 5 minutes)

Example curl (for testing):

```bash
curl -i https://marketing-automation-kc2t.onrender.com/health
```

If you want me to create a scheduled GitHub Action or a small keepalive script in the repo instead, tell me and I'll add it.
