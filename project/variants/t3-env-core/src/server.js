import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await createApp();

createServer(app).listen(config.app.port, config.app.host, () => {
  console.log(`${config.app.name} listening on http://${config.app.host}:${config.app.port}`);
});
