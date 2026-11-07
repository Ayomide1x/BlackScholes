# Black–Scholes option pricer

An interactive Black–Scholes calculator for European call and put options.

https://blackscholes.ayomideo.dev

## What it does

- Prices a call and a put from spot, strike, time to maturity, volatility and the risk-free rate. The formula is shown with your numbers substituted in.
- Shows all five Greeks (delta, gamma, vega, theta, rho) for both options, in trader units: vega and rho per percentage point, theta per day.
- Draws call and put heatmaps across a range of spot prices and volatilities. The range follows your inputs, or you can set it yourself.
- Plots option value today against payoff at expiry across spot prices.

Everything recalculates in the browser as you type or drag, so there is no server round trip.

## Layout

- `web/`: the app (React, TypeScript and Vite). The model is `web/src/blackScholes.ts`, tested against Python reference values in `web/src/blackScholes.test.ts`.
- `Dockerfile`, `docker-compose.yml` and `deploy/`: the production container and the shared Caddy site block. See [DEPLOY.md](DEPLOY.md).
- `BlackScholes.py`, `streamlit_app.py`: the original Streamlit version.

## Running locally

```sh
cd web
npm install
npm run dev
```
