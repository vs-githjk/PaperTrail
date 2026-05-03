const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const config = require("./config");

const app = express();

function isDevLocalhostOrigin(origin) {
  if (config.env !== "development") return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

const corsAllowedHeaders = ["Authorization", "Content-Type", "Accept"];

const corsOptions = config.corsOrigins.length === 0
  ? { allowedHeaders: corsAllowedHeaders }
  : {
      allowedHeaders: corsAllowedHeaders,
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        if (isDevLocalhostOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Origin not allowed by CORS"));
      }
    };

app.use(express.json());
app.use(cors(corsOptions));
app.use("/api", routes);

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  res.status(status).json({ error: message });
});

module.exports = app;
