/// <reference lib="webworker" />
import { MODELS, curvePoints, greeksOf, priceGrid } from "../models";
import type { Reply, Request } from "./protocol";

const post = (reply: Reply) => self.postMessage(reply);

// Each job sends results as soon as they exist: prices before the slower
// Greeks, and the heatmap one row at a time. The page cancels a job by
// terminating the worker.
self.onmessage = (e: MessageEvent<Request>) => {
  const req = e.data;
  const model = MODELS.find((m) => m.id === req.modelId);
  if (!model) return;
  const { id, market, params } = req;

  switch (req.kind) {
    case "summary": {
      const estimate = model.estimate?.(market, params) ?? null;
      const prices = estimate ? { call: estimate.call, put: estimate.put } : model.price(market, params);
      post({ id, kind: "prices", prices, estimate });
      post({ id, kind: "greeks", greeks: greeksOf(model, market, params) });
      break;
    }
    case "grid":
      req.vols.forEach((vol, row) => {
        const g = priceGrid(model, market, params, req.spots, [vol]);
        post({ id, kind: "row", row, call: g.call[0], put: g.put[0] });
      });
      break;
    case "curve":
      post({ id, kind: "curve", points: curvePoints(model, market, params) });
      break;
  }
};
