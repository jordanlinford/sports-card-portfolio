# VPS Scraper Worker Architecture

This document describes how to move the eBay scraper worker off Replit to a dedicated-IP VPS for improved reliability.

## Why Move to VPS?

1. **Dedicated IP**: Replit's shared infrastructure means many users share IPs, increasing chance of rate limiting
2. **Consistent Identity**: A dedicated VPS maintains the same IP, allowing gradual trust building with eBay
3. **Better Control**: Full control over request timing, headers, and retry logic
4. **Separation of Concerns**: Keeps the scraping load off the main application server

## Architecture Overview

```
┌─────────────────────┐     ┌─────────────────────┐
│   Replit App        │     │   VPS Worker        │
│                     │     │                     │
│  ┌───────────────┐  │     │  ┌───────────────┐  │
│  │ API Server    │  │     │  │ Scraper       │  │
│  │               │  │     │  │ Worker        │  │
│  │ - Serves UI   │  │     │  │               │  │
│  │ - Auth/Users  │  │     │  │ - Polls DB    │  │
│  │ - Queue Jobs  │──┼─────┼──│ - Scrapes eBay│  │
│  │               │  │     │  │ - Writes comps│  │
│  └───────────────┘  │     │  └───────────────┘  │
│                     │     │                     │
│  ┌───────────────┐  │     │                     │
│  │ PostgreSQL DB │◀─┼─────┼───(Direct DB conn)  │
│  │               │  │     │                     │
│  │ - Jobs queue  │  │     │                     │
│  │ - Comps cache │  │     │                     │
│  └───────────────┘  │     │                     │
└─────────────────────┘     └─────────────────────┘
```

## Implementation Steps

### 1. Create a Job Queue Table

Add a table to track pending scrape jobs:

```sql
CREATE TABLE scrape_jobs (
  id SERIAL PRIMARY KEY,
  query_hash VARCHAR(64) NOT NULL,
  canonical_query TEXT NOT NULL,
  filters JSONB,
  status VARCHAR(20) DEFAULT 'pending', -- pending, running, complete, failed
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  worker_id VARCHAR(50),
  error_message TEXT
);

CREATE INDEX idx_scrape_jobs_status ON scrape_jobs(status, priority DESC, created_at);
```

### 2. Modify Replit App

Update the app to queue jobs instead of running them inline:

```typescript
// In ebayCompsService.ts
export async function enqueueFetchJob(
  canonicalQuery: string,
  queryHash: string,
  filters: CompsQueryFilters
): Promise<{ queued: boolean }> {
  // Insert into jobs queue instead of running locally
  await db.insert(scrapeJobs).values({
    queryHash,
    canonicalQuery,
    filters,
    status: 'pending',
    priority: 0
  }).onConflictDoNothing();
  
  return { queued: true };
}
```

### 3. VPS Worker Script

Create a standalone Node.js worker that runs on the VPS:

```typescript
// vps-worker/index.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const WORKER_ID = `vps-${process.env.HOSTNAME || 'worker'}`;
const POLL_INTERVAL = 30000; // 30 seconds
const INTER_REQUEST_DELAY = 10000; // 10 seconds between scrapes

async function claimJob() {
  const result = await pool.query(`
    UPDATE scrape_jobs
    SET status = 'running', 
        started_at = NOW(), 
        worker_id = $1
    WHERE id = (
      SELECT id FROM scrape_jobs
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `, [WORKER_ID]);
  
  return result.rows[0] || null;
}

async function completeJob(jobId: number, comps: any[], summary: any) {
  // Update the market_comps_cache table with results
  await pool.query(`
    UPDATE market_comps_cache
    SET comps_json = $1,
        summary_json = $2,
        sold_count = $3,
        fetch_status = 'complete',
        last_fetched_at = NOW(),
        expires_at = NOW() + INTERVAL '7 days'
    WHERE query_hash = (
      SELECT query_hash FROM scrape_jobs WHERE id = $4
    )
  `, [JSON.stringify(comps), JSON.stringify(summary), comps.length, jobId]);
  
  await pool.query(`
    UPDATE scrape_jobs
    SET status = 'complete', completed_at = NOW()
    WHERE id = $1
  `, [jobId]);
}

async function failJob(jobId: number, error: string) {
  await pool.query(`
    UPDATE scrape_jobs
    SET status = 'failed', 
        error_message = $1,
        completed_at = NOW()
    WHERE id = $2
  `, [error, jobId]);
}

async function processJob(job: any) {
  console.log(`Processing job ${job.id}: ${job.canonical_query}`);
  
  try {
    // Your scraping logic here
    const comps = await scrapeEbay(job.canonical_query, job.filters);
    await completeJob(job.id, comps, calculateSummary(comps));
  } catch (err) {
    await failJob(job.id, err.message);
  }
}

async function runWorker() {
  console.log(`Worker ${WORKER_ID} starting...`);
  
  while (true) {
    const job = await claimJob();
    
    if (job) {
      await processJob(job);
      await sleep(INTER_REQUEST_DELAY);
    } else {
      await sleep(POLL_INTERVAL);
    }
  }
}

runWorker().catch(console.error);
```

### 4. VPS Setup

Recommended VPS providers with good IP reputation:
- **DigitalOcean** ($4-6/month droplet)
- **Vultr** ($3.50-5/month)
- **Linode** ($5/month)

Setup steps:

```bash
# 1. Create Ubuntu 22.04 VPS
# 2. SSH into server
ssh root@your-vps-ip

# 3. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs

# 4. Create worker directory
mkdir -p /opt/scraper-worker
cd /opt/scraper-worker

# 5. Copy worker code
# (Use scp or git clone your worker repo)

# 6. Install dependencies
npm install

# 7. Set environment variables
export DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"

# 8. Create systemd service
cat > /etc/systemd/system/scraper-worker.service << EOF
[Unit]
Description=eBay Scraper Worker
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/scraper-worker
Environment=DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 9. Enable and start
systemctl enable scraper-worker
systemctl start scraper-worker

# 10. Check status
systemctl status scraper-worker
journalctl -u scraper-worker -f
```

### 5. Security Considerations

1. **Database Access**: Use SSL and restrict IP access to VPS IP only
2. **Credentials**: Store DATABASE_URL securely, not in code
3. **Monitoring**: Set up alerts for worker failures
4. **Rate Limiting**: Add backoff logic when hitting limits

### 6. Future Enhancements

- **Multiple Workers**: Run 2-3 VPS workers in different regions
- **Proxy Rotation**: Add ScraperAPI or residential proxy for fallback
- **Smart Scheduling**: Prioritize high-value cards and peak hours
- **Health Checks**: Ping endpoint to verify worker is running

## Environment Variables Required on VPS

```bash
DATABASE_URL=postgresql://...  # Replit Postgres connection string
WORKER_ID=vps-1                # Unique identifier for this worker
```

## Monitoring

Check worker status:
```sql
SELECT worker_id, status, COUNT(*) 
FROM scrape_jobs 
WHERE started_at > NOW() - INTERVAL '24 hours'
GROUP BY worker_id, status;
```

Check for stuck jobs:
```sql
SELECT * FROM scrape_jobs 
WHERE status = 'running' 
AND started_at < NOW() - INTERVAL '10 minutes';
```
