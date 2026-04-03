const { createApp } = require("./app");
const { ping } = require("./db");

const app = createApp();
const port = Number(process.env.PORT) || 3000;

app.listen(port, async () => {
  console.log(`Server listening on http://localhost:${port}`);
  try {
    await ping();
    console.log("PostgreSQL: connected");
  } catch (err) {
    console.error("PostgreSQL: connection failed —", err.message);
  }
});
