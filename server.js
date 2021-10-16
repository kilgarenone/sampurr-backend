import app from "./app.js";

app.listen(app.get("port"), () => {
  console.log(`🚀  Your server is live at locahost:${app.get("port")} 🚀 `);
});
