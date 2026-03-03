# Secret Rotation Runbook

## Scope

This runbook defines controlled secret rotation for production `cloud.uppoint.com.tr`.

Managed secrets:

- `AUTH_SECRET`
- `AUTH_OTP_PEPPER`
- `INTERNAL_AUDIT_TOKEN`
- `INTERNAL_DISPATCH_TOKEN`
- `INTERNAL_AUDIT_SIGNING_SECRET`
- `INTERNAL_DISPATCH_SIGNING_SECRET`
- `NOTIFICATION_PAYLOAD_SECRET`
- `AUDIT_LOG_SIGNING_SECRET`
- `AUDIT_ANCHOR_SIGNING_SECRET`

## Rotation policy

1. Rotate high-impact auth/internal secrets at least every 90 days.
2. Rotate immediately on suspected disclosure.
3. Track rotation in `CHANGELOG.md` and ops incident/change ticket.
4. Keep rollback values sealed and time-limited.

## Standard procedure

1. Generate new secret material (>=32 random bytes, base64url or hex).
2. Update secret store or `/opt/uppoint-cloud/.env` on target host.
3. If protocol allows overlap, run dual-accept window first:
   - signer emits new key
   - verifier accepts old+new keys
4. Run verification:
   - `cd /opt/uppoint-cloud`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
   - `npm run verify:security-gate`
5. Apply deployment restart only when required:
   - `npm run build:deploy`
6. Validate live:
   - `RUN_E2E=1 E2E_BASE_URL=https://cloud.uppoint.com.tr npm run test:e2e:remote`
   - `npm run verify:edge-audit-emit`
7. Close overlap window and revoke old secret.

## Rollback

1. Revert to previous known-good secret set.
2. Restart service (`npm run build:deploy`).
3. Re-run verification commands.
4. Document rollback reason and blast radius.

## Notes

- Never commit secrets to git.
- Never rotate multiple unrelated secrets simultaneously without change window approval.
- For signer/verifier pairs (`INTERNAL_*_SIGNING_SECRET`, `AUDIT_*_SIGNING_SECRET`), prefer overlap rollout to prevent hard cutover outages.
