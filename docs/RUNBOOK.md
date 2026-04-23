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
