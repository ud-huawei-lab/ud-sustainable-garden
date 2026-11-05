import { createApp } from "./app.js";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5173);
const app = await createApp(process.env);
app.listen(port, host, () =>
  console.log(`UD Sustainable Garden: http://${host}:${port}`),
);
