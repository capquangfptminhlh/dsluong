# Blogger draft pilot operations

The Blogger worker creates drafts only. It must not be enabled in crontab until the four-draft pilot has been reviewed and approved.

## Required production configuration

Use a dedicated Google OAuth client that has access only to the pilot Blogger test blog. The refresh token must include the Blogger API scope:

`https://www.googleapis.com/auth/blogger`

Store these values in the production environment or secret manager; never put them in `config/`, the ledger, or logs:

- `BLOGGER_OAUTH_CLIENT_ID`
- `BLOGGER_OAUTH_CLIENT_SECRET`
- `BLOGGER_REFRESH_TOKEN`
- `GEMINI_API_KEY` or `GEMINI_API_KEYS`

Set `NODE_ENV=production` and set `BLOGGER_LEDGER_PATH=/var/lib/autotax-seo/blogger-ledger.json`. The worker rejects any other production ledger path. The ledger directory must be owned by the worker account and restricted to that account.

Before the pilot, configure `config/blogger-sites.json` so that the pilot test blog is the only enabled site, and ensure its topics and approved facts are present. Do not point the pilot at a production blog.

## Manual pilot run

From the deployed project directory, run the same guarded command used by the wrapper:

```bash
cd /var/www/autotax/seo-engine
/usr/bin/flock -n /var/lock/autotax_blogger.lock /usr/bin/npx tsx scripts/blogger/run-worker.ts
```

Expected successful output is one JSON result with a `COMPLETED` status and a Blogger draft post ID. Failure output is a JSON object with `status: "FAILED"` and a non-secret reason code. Normal operational logs may include topic IDs, site IDs, post IDs, statuses, and reason codes. They must never include OAuth client secrets, refresh tokens, Gemini keys, or full credential-bearing request URLs.

Review each resulting draft in the test blog: it must remain a draft, use only approved facts, satisfy the link policy, and be distinct from primary-site content.

## Four-draft pilot

1. Keep the Blogger crontab line commented (`# ... AUTOTAX_BLOGGER_PILOT`).
2. Run the guarded command manually once and review the one generated test-blog draft.
3. Correct configuration, facts, or topics before the next run; do not retry a failed insert blindly.
4. Repeat until four separate drafts have passed editorial, factual, link, and originality review.
5. Record the four post IDs and reviewer approval. Only then may an operator remove the leading `# ` from the `AUTOTAX_BLOGGER_PILOT` line and install the revised crontab.

The deployment script replaces only pre-existing cron lines containing `autotax-blogger`; primary daily and ranking cron entries are retained.

## Recovery by reason

| Reason | Safe recovery |
| --- | --- |
| `INSERT_STARTED` | Do not create another draft. Inspect the ledger entry and use the Blogger admin API/read-back to find the recorded post ID or matching draft. Re-run only after reconciliation; an unresolved entry requires operator review. |
| `VERIFY_FAILED` | Treat the insert as potentially successful. Check the draft in Blogger by returned post ID before any retry. Once verified, reconcile the ledger; otherwise correct the API/configuration issue and regenerate only after confirming no remote draft exists. |
| `FACT_EXPIRED` | Refresh or replace the affected approved fact, then return the topic to `REGENERATE`. Do not publish or force the stale factual claim. |
| `PRIMARY_TOPIC_COLLISION` | Select a meaningfully distinct topic/angle and regenerate. Do not override the collision gate. |
| `SIMILARITY_HOLD` | Rewrite from a distinct brief or select a different topic. Keep the configured similarity threshold; do not lower it to pass the draft. |

## Stale ledger lock recovery

The ledger lock is `/var/lib/autotax-seo/blogger-ledger.json.lock`. A lock may be stale only after a process crash. First confirm that no worker owns it:

```bash
pgrep -af 'scripts/blogger/run-worker.ts'
lsof /var/lib/autotax-seo/blogger-ledger.json.lock
```

If either command shows an active worker or an open lock, leave the lock in place and wait for that worker to finish. Only when both checks confirm no worker process holds the lock may an operator remove the specific stale lock file:

```bash
rm -f /var/lib/autotax-seo/blogger-ledger.json.lock
```

Then run one manual guarded worker invocation and verify the ledger and test-blog draft before resuming the pilot.
