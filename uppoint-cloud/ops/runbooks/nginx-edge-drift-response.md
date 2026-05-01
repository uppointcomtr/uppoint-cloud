# Nginx Drift and Edge Audit Emit Runbook

Use this when Nginx rate-limit/CSP/proxy drift or edge audit emit delivery fails.

## Detection

- `npm run verify:nginx-drift`
- `npm run verify:edge-audit-emit`
- Logs:
  - `/var/log/nginx/error.log`
  - `/var/log/uppoint-cloud/edge-audit-emit-check.log`
  - `/var/log/uppoint-cloud/security-alerts.log`

## Immediate Containment

1. Do not disable CSP, host/origin guards, or audit emit checks.
2. Restore the last known-good Nginx config if live requests are affected.
3. Keep edge audit failures visible in local logs.

## Diagnosis

```bash
cd /opt/uppoint-cloud
npm run verify:nginx-drift
npm run verify:edge-audit-emit
nginx -t
tail -n 100 /var/log/nginx/error.log
tail -n 100 /var/log/uppoint-cloud/edge-audit-emit-check.log
```

Check:

- Nginx snippets match repository templates.
- Health token snippet exists only on loopback health path.
- Internal audit endpoint is loopback.
- Internal audit ingest is not self-blocking edge telemetry through browser/device adaptive rate-limit signals.
- CSP nonce injection is still active.

## Recovery

1. Restore repository-backed Nginx config.
2. Run `nginx -t`.
3. Reload Nginx.
4. If the app audit-ingest contract changed, run `npm run build` and `npm run service:restart`.
5. Re-run drift and edge emit checks.

## Verification

```bash
npm run verify:nginx-drift
npm run verify:edge-audit-emit
curl -I https://cloud.uppoint.com.tr/tr/login
```
