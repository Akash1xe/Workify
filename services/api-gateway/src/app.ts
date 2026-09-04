import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createProxyMiddleware } from "http-proxy-middleware";
import { env } from "./config/env";
import { rateLimit } from "./middleware/rateLimit";
import { requestId } from "./middleware/requestId";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", env.trustProxy);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Origin is not allowed"));
  },
  credentials: true
}));
app.use(requestId);

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use(rateLimit);

app.use("/api/auth", createProxyMiddleware({
  target: env.AUTH_SERVICE_URL,
  changeOrigin: true,
  pathRewrite(path) {
    if (path.startsWith("/api/auth")) return path.replace(/^\/api/, "");
    if (path.startsWith("/auth")) return path;
    return `/auth${path.startsWith("/") ? path : `/${path}`}`;
  },
  on: {
    proxyReq(proxyReq, req) {
      const id = req.headers["x-request-id"];
      if (id) proxyReq.setHeader("x-request-id", id);
      proxyReq.setHeader("x-forwarded-prefix", "/api");
    },
    error(error, req, res) {
      console.error("Auth service proxy error", {
        requestId: req.headers["x-request-id"],
        message: error.message
      });
      if ("writeHead" in res && !res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
      }
      if ("end" in res) res.end(JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Auth service unavailable" } }));
    }
  }
}));

app.use("/api/organizations", createProxyMiddleware({
  target: env.ORGANIZATION_SERVICE_URL,
  changeOrigin: true,
  pathRewrite(path) {
    if (path.startsWith("/api/organizations")) return path.replace(/^\/api/, "");
    if (path.startsWith("/organizations")) return path;
    return `/organizations${path.startsWith("/") ? path : `/${path}`}`;
  },
  on: {
    proxyReq(proxyReq, req) {
      const id = req.headers["x-request-id"];
      if (id) proxyReq.setHeader("x-request-id", id);
      proxyReq.setHeader("x-forwarded-prefix", "/api");
    },
    error(error, req, res) {
      console.error("Organization service proxy error", {
        requestId: req.headers["x-request-id"],
        message: error.message
      });
      if ("writeHead" in res && !res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
      }
      if ("end" in res) res.end(JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Organization service unavailable" } }));
    }
  }
}));

app.use("/api/catalog", createProxyMiddleware({
  target: env.CATALOG_SERVICE_URL,
  changeOrigin: true,
  pathRewrite(path) {
    const stripped = path.replace(/^\/api\/catalog/, "");
    return stripped.startsWith("/") ? stripped : `/${stripped}`;
  },
  on: {
    proxyReq(proxyReq, req) {
      const id = req.headers["x-request-id"];
      if (id) proxyReq.setHeader("x-request-id", id);
      proxyReq.setHeader("x-forwarded-prefix", "/api/catalog");
    },
    error(error, req, res) {
      console.error("Catalog service proxy error", {
        requestId: req.headers["x-request-id"],
        message: error.message
      });
      if ("writeHead" in res && !res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
      }
      if ("end" in res) res.end(JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Catalog service unavailable" } }));
    }
  }
}));

app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } }));
app.use((error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Gateway request error", { requestId: req.header("x-request-id"), message: error.message });
  res.status(500).json({ error: { code: "GATEWAY_ERROR", message: "Gateway request failed" } });
});
