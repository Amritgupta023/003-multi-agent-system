require("dotenv").config();

const { app } = require("./app");
const { getConfig } = require("./config");

const config = getConfig();

const server = app.listen(config.port, () => {
  console.log(`Research Assistant API listening on http://localhost:${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} received. Closing HTTP server...`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
