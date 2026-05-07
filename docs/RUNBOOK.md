# Production Runbook

## If production is broken

### Step 1: Check what's happening
```bash
# Check if the app is responding
curl https://your-domain.com/health

# Check recent deploys (Replit dashboard or git log)
git log --oneline -5

# Check server logs in Replit console for errors
```

### Step 2: Roll back if a deploy caused it
```bash
# Revert the last commit on main
git revert HEAD --no-edit
git push origin main
# Replit will auto-deploy
```

### Step 3: If it's a database issue
```bash
# Check connection pool status (look for "[DB Pool]" in logs)
# If connections are exhausted, restart the Replit deployment

# If data is corrupted, check Replit's automatic backups:
# Replit Dashboard → Database → Backups
```

---

## Common issues

### "Users can't log in"
1. Check if Google OAuth credentials are still valid in Replit Secrets
2. Check if `SESSION_SECRET` changed (invalidates all sessions)
3. Check if the sessions table is corrupted: `SELECT count(*) FROM sessions;`

### "Card scanning isn't working"
1. Check `AI_INTEGRATIONS_GEMINI_API_KEY` is set and valid
2. Check scan worker logs for `[ScanWorker]` errors
3. Check if daily scan limits are being hit (free: 3/day, pro: 20/day)

### "Prices aren't updating"
1. Check if the eBay scraper VPS is running
2. Check `[Alpha]` logs for observation insert errors
3. Check if `player_outlook_cache` has recent entries:
   ```sql
   SELECT player_key, updated_at FROM player_outlook_cache ORDER BY updated_at DESC LIMIT 5;
   ```

### "Stripe payments failing"
1. Check Stripe dashboard for webhook delivery failures
2. Verify `STRIPE_PRICE_ID` matches the active price in Stripe
3. Check for `[Stripe]` errors in server logs

### "App is slow"
1. Check structured request logs for slow requests (`"slow": true`)
2. Check DB pool stats (`[DB Pool]` warnings)
3. Check if background jobs are overwhelming the connection pool
4. Consider restarting the Replit deployment to clear in-memory caches

---

## Key environment variables
If any of these are missing or wrong, the app will break:
- `DATABASE_URL` — app won't start
- `SESSION_SECRET` — sessions won't work
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google login broken
- `AI_INTEGRATIONS_GEMINI_API_KEY` — card scanning and outlooks broken

---

## Database operations

### Check table sizes
```sql
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;
```

### Check for orphaned records
```sql
-- Cards without a display case
SELECT count(*) FROM cards WHERE display_case_id NOT IN (SELECT id FROM display_cases);

-- Bookmarks for deleted cards
SELECT count(*) FROM bookmarks WHERE card_id NOT IN (SELECT id FROM cards);
```

### Clear stale sessions
```sql
DELETE FROM sessions WHERE expire < NOW();
```

---

## Bulk-email deliverability spot check

Outbound transactional and bulk email is sent through Gmail SMTP
(`smtp.gmail.com:465`) using a Gmail App Password. The credential resolver
in `server/email.ts` selects a single provider profile atomically: if both
`GMAIL_EMAIL` and `GMAIL_APP_PASSWORD` are set, the Gmail profile is used
(host/port default to `smtp.gmail.com:465`); otherwise the resolver falls
back to the legacy Zoho profile (`ZOHO_EMAIL` + `ZOHO_APP_PASSWORD`, host
`smtp.zoho.com:465`). Mixing Gmail credentials with a Zoho host (or vice
versa) is not possible — host/port are derived from whichever profile is
chosen. New deployments should set the Gmail variants:

- `GMAIL_EMAIL` — the sending Google account (e.g. `info@hobbyalpha.com`)
- `GMAIL_APP_PASSWORD` — a 16-character Gmail App Password (NOT the account
  password); generate at https://myaccount.google.com/apppasswords with
  2-Step Verification enabled
- `GMAIL_SMTP_HOST` (optional) — defaults to `smtp.gmail.com`
- `GMAIL_SMTP_PORT` (optional) — defaults to `465` (SSL)

Spot check after rotating the App Password or changing SMTP config:

1. Confirm the secrets are present in Replit Secrets (`GMAIL_EMAIL`,
   `GMAIL_APP_PASSWORD`).
2. Trigger a low-risk transactional send (e.g. trigger the welcome email by
   signing up a fresh test account, or fire the admin email sample suite).
3. Check the Replit server logs for `Welcome email sent to ...` (success) or
   `Failed to send ...` / `SMTP email not configured` (misconfiguration).
4. Confirm the message arrives in the recipient inbox and is not flagged as
   spam. Gmail rejects with `534-5.7.9 Application-specific password required`
   means the App Password is missing/wrong.
5. Once Gmail is verified stable in production, the legacy `ZOHO_*` secrets
   can be deleted from Replit Secrets.
