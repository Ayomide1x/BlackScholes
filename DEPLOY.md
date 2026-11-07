# Deploying to the Oracle VM

This puts the pricer at `https://blackscholes.ayomideo.dev` on the same VM as the other projects, behind the shared Caddy container.

```
internet :443 ──► shared Caddy (own Compose project, host networking, HTTPS)
                        │  blackscholes.ayomideo.dev
                        ▼
                 127.0.0.1:3410 ──► blackscholes-web (static files, Caddy inside)
```

The app is static: all pricing runs in the browser. There is no database, no secrets and no backend process. The container listens only on loopback, is read-only, and is capped at 64 MB of memory.

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
docker compose up -d --build --wait      # the build runs the tests; a failure stops it
docker compose ps --format '{{.Service}}\t{{.Status}}\t{{.Ports}}'
# web   Up ... (healthy)   127.0.0.1:3410->8080/tcp
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3410/     # 200
```

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

## Updating

```sh
cd ~/blackscholes
git pull --ff-only
docker compose up -d --build --wait
```

## Running locally

```sh
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # checks the TypeScript model against Python reference values
```

`web/scripts/make_fixtures.py` regenerates those reference values (`src/fixtures.json`) using only Python's standard library.
