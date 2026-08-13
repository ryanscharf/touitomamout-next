# Sidecars: updater & alerter

This fork adds two optional companion containers to the compose stack, alongside the main `touitomamout` service. Both are built by [`.github/workflows/docker.yml`](.github/workflows/docker.yml) and published to:

- `ghcr.io/ryanscharf/touitomamout-next-updater:latest`
- `ghcr.io/ryanscharf/touitomamout-next-alerter:latest`

## updater

Watches [yamada-sexta/touitomamout-next](https://github.com/yamada-sexta/touitomamout-next) for new commits and, when one lands, pulls the latest `touitomamout` image and restarts that container. Runs on a daily cron (`0 2 * * *`, i.e. 2 AM).

Built from [`Dockerfile.updater`](Dockerfile.updater) / [`update.sh`](update.sh) / [`entrypoint.sh`](entrypoint.sh).

**No environment variables required.**

**Required volumes:**

| Mount | Purpose |
| --- | --- |
| `/var/run/docker.sock` | Lets the container call `docker compose pull`/`up` on the host's Docker daemon |
| Your compose file → `/docker-compose.yml` | The stack definition the updater re-applies after a pull (mount whatever your compose file is actually named — `compose.yaml`, `docker-compose.yml`, etc. — to this path) |
| A persistent directory → `/var/lib/touitomamout` | Stores `commit.txt`, the last-seen upstream commit hash, so the updater only acts on new commits |

```yaml
  updater:
    image: ghcr.io/ryanscharf/touitomamout-next-updater:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./compose.yaml:/docker-compose.yml
      - ./data:/var/lib/touitomamout
```

## alerter

Watches the `touitomamout` container's own logs for X/Twitter authentication failures (stale/expired cookie, rejected credentials, X's "suspicious login" block — anything `formatTwitterAuthError` in [`src/sync/x-auth.ts`](src/sync/x-auth.ts) reports) and emails you when one is found. Checks every 15 minutes; once it alerts, it won't alert again for `ALERT_COOLDOWN_HOURS` even if the problem persists, so it doesn't spam you every cycle.

Built from [`Dockerfile.alerter`](Dockerfile.alerter) / [`alert.sh`](alert.sh) / [`entrypoint.alerter.sh`](entrypoint.alerter.sh).

**Environment variables** (add to `.env`, see [`.env.example`](.env.example)):

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SMTP_HOST` | Yes | — | Your SMTP relay/provider hostname |
| `SMTP_PORT` | No | `587` | SMTP port (STARTTLS) |
| `SMTP_USER` | Yes | — | SMTP auth username |
| `SMTP_PASS` | Yes | — | SMTP auth password (use an app password if your provider supports it, e.g. Gmail) |
| `ALERT_EMAIL_FROM` | Yes | — | From address for alert emails |
| `ALERT_EMAIL_TO` | Yes | — | Where alerts get sent |
| `ALERT_TARGET_CONTAINER` | No | `touitomamout` | Name of the container whose logs get checked |
| `ALERT_LOG_WINDOW` | No | `20m` | How far back in the logs to look each run |
| `ALERT_COOLDOWN_HOURS` | No | `24` | Minimum time between repeat alerts for the same ongoing failure |

**Required volumes:**

| Mount | Purpose |
| --- | --- |
| `/var/run/docker.sock` | Lets the container run `docker logs` against the `touitomamout` container |
| A persistent directory → `/var/lib/touitomamout-alert` | Stores `last-alert.txt`, the cooldown timestamp |

```yaml
  alerter:
    image: ghcr.io/ryanscharf/touitomamout-next-alerter:latest
    restart: unless-stopped
    env_file: .env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./alert-data:/var/lib/touitomamout-alert
```
