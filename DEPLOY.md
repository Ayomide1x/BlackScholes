# Deploying to the Oracle VM

This puts the pricer at `https://blackscholes.ayomideo.dev` on the same VM as the other projects, behind the shared Caddy container.

```
internet :443 ──► shared Caddy (own Compose project, host networking, HTTPS)
                        │  blackscholes.ayomideo.dev
                        ▼
                 127.0.0.1:3410 ──► web (static files; /api/* passed on) ──► api :8000 (internal only)
                                                                                 │ reads
                                     cron, weekdays ──► calibrator (one-off) ──► calibration volume (SQLite)
```

All pricing runs in the browser. The backend only serves Heston calibrations: once a weekday, the calibrator fetches an SPX option chain (Yahoo, via `yfinance`) and Treasury yields (FRED), fits Heston, and stores the result in SQLite. The API reads that file and nothing else.

- Only the web container publishes a port, on loopback. The API is reachable only on the project's own network.
- The web and API containers are read-only and memory-capped (64 MB and 256 MB). The API mounts the database read-only; the calibrator is its only writer.
- No secrets: both data sources are public and need no key.

Commands under "On the VM" run over SSH (`ssh 129.146.48.152`); the rest run on your Mac.

## 1. DNS (name.com)

Under **Manage DNS Records** for `ayomideo.dev`, add:

| Type | Host | Answer | TTL |
| --- | --- | --- | --- |
| A | `blackscholes` | `129.146.48.152` | 300 |

Do this first. Caddy needs the name to resolve to the VM before it can get a certificate. Check it:

```sh
dig +short blackscholes.ayomideo.dev     # 129.146.48.152
```

## 2. Clone, build and start (on the VM)

Check that the port is free (prints nothing):

```sh
sudo ss -ltnp | grep -w 3410
```

Then:

```sh
git clone https://github.com/Ayomide1x/BlackScholes.git ~/blackscholes
cd ~/blackscholes
docker compose up -d --build --wait      # the builds run both test suites; a failure stops them
docker compose ps --format '{{.Service}}\t{{.Status}}\t{{.Ports}}'
# api   Up ... (healthy)   8000/tcp
# web   Up ... (healthy)   127.0.0.1:3410->8080/tcp
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3410/     # 200
curl -s http://127.0.0.1:3410/api/health                             # {"ok":true,...}
```

The API build runs the calibration tests, which take about a minute on a laptop and several on the VM's ARM cores.

## 3. Add the site to the shared Caddy (on the VM)

Find Caddy's container and the host path of its Caddyfile:

```sh
CADDY=$(docker ps --format '{{.Names}}' | grep -i caddy | head -1); echo "$CADDY"
docker inspect -f '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' "$CADDY"
```

Append the site block to the host file mounted at `/etc/caddy/Caddyfile`, then validate and reload. A reload keeps the other sites up:

```sh
CADDYFILE=<host path of /etc/caddy/Caddyfile>
cp "$CADDYFILE" "$CADDYFILE.bak-$(date +%F)"
{ echo; cat ~/blackscholes/deploy/blackscholes.caddy; } >>"$CADDYFILE"
docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile   # Valid configuration
docker exec -w /etc/caddy "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker logs "$CADDY" --since 2m 2>&1 | grep -i blackscholes | grep -iE 'certificate obtained|error'
```

If validation fails, restore the `.bak` file and don't reload.

## 4. Check (on your Mac)

```sh
curl -sI https://blackscholes.ayomideo.dev/ | head -1                    # HTTP/2 200
curl -s -o /dev/null -w '%{http_code}\n' https://objectstore.ayomideo.dev/   # still 401: other sites unaffected
```

Open the site, drag a slider, and check that the prices, heatmaps and curve update.

## 5. Schedule the calibrator (on the VM)

The calibrator must run while US markets are open: outside trading hours Yahoo shows no bids or asks, and the job rejects the day. Check the VM's clock first:

```sh
timedatectl | grep 'Time zone'           # Etc/UTC (if not, convert the time below)
```

Run it once by hand during market hours (14:30–21:00 UTC in winter, 13:30–20:00 in summer):

```sh
cd ~/blackscholes && docker compose run --rm calibrator
# 2026-11-09: ok. Fitted 172 quotes across 7 expiries; error 1.66 vol points. Parameters: {...}
curl -s http://127.0.0.1:3410/api/calibrations/latest | head -c 300; echo
```

A fit takes 20–60 seconds on the VM. Then schedule it for 19:30 UTC on weekdays (2:30 p.m. New York in winter, 3:30 p.m. in summer, both before the close). `crontab -e`, and add:

```
30 19 * * 1-5 cd $HOME/blackscholes && docker compose run --rm calibrator >>$HOME/blackscholes-calibration.log 2>&1
```

Every run is recorded, whatever happens:

- **ok:** the fit is saved, replacing any earlier fit for the same New York date.
- **rejected:** the data or the fit failed a check (too few usable quotes, or a fit error over 3 volatility points). Nothing is saved as a fit, but the day's raw snapshot is kept.
- **failed:** an error, such as Yahoo or FRED being unreachable.

On market holidays Yahoo has no live quotes, so expect a rejection.

## Running it

```sh
curl -s http://127.0.0.1:3410/api/health          # lastSuccess: when the job last succeeded
curl -s http://127.0.0.1:3410/api/runs?limit=5    # each run's status, message and drop counts
tail ~/blackscholes-calibration.log
```

**Refitting a stored day** (after improving the cleaning or the fit) uses the saved snapshot, so it needs no market data:

```sh
docker compose run --rm calibrator python -m calibration.job --date 2026-11-09
```

**The data** lives in the `blackscholes_calibration` volume: about 100 KB a day of compressed snapshots, plus the fits. `docker compose down` keeps it; `docker compose down -v` deletes it.

## Updating

```sh
cd ~/blackscholes
git pull --ff-only
docker compose up -d --build --wait
```

## Running locally

The frontend:

```sh
cd web
npm install
npm run dev        # http://localhost:5173; /api is proxied to port 8000
npm test           # checks every model against Python reference values
```

The backend, if you want `/api` in development:

```sh
cd api
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/python -m pytest -q tests
.venv/bin/python -m calibration.job --db calibration.db             # one live run (market hours)
CALIBRATION_DB=calibration.db .venv/bin/uvicorn calibration.app:app --port 8000
```

Or the whole stack, as on the VM: `docker compose up -d --build --wait`, then `docker compose run --rm calibrator`.

The scripts in `web/scripts/` regenerate the reference values in `web/src/models/*.json` using only Python's standard library.
