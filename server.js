import express from "express";
import cors from "cors";
import morgan from "morgan";

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use(express.static("public"));

// --- In-memory demo data
let nextId = 1;
const makeId = () => String(nextId++);

const users = [
  { id: makeId(), name: "Alice", email: "alice@example.com" },
  { id: makeId(), name: "Bob", email: "bob@example.com" },
];

const todos = [
  { id: makeId(), userId: users[0].id, title: "Buy coffee", completed: false },
  { id: makeId(), userId: users[0].id, title: "Edit wedding photos", completed: true },
  { id: makeId(), userId: users[1].id, title: "Prepare client proposal", completed: false },
];

// --- Simple metrics middleware
const metrics = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  byRoute: {}, // routeKey -> { count, statuses: {200: n, ...}, totalMs }
  recent: [], // last 100 requests
};

function routeKey(req) {
  // group by method + path template (remove ids)
  return `${req.method} ${req.route ? req.baseUrl + (req.route.path || "") : req.originalUrl.split("?")[0]}`;
}

app.use((req, res, next) => {
  const t0 = performance.now();
  res.on("finish", () => {
    const t1 = performance.now();
    const ms = t1 - t0;
    metrics.totalRequests += 1;

    const key = routeKey(req);
    if (!metrics.byRoute[key]) metrics.byRoute[key] = { count: 0, totalMs: 0, statuses: {} };
    metrics.byRoute[key].count += 1;
    metrics.byRoute[key].totalMs += ms;
    metrics.byRoute[key].statuses[res.statusCode] = (metrics.byRoute[key].statuses[res.statusCode] || 0) + 1;

    metrics.recent.push({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(ms)
    });
    if (metrics.recent.length > 100) metrics.recent.shift();
  });
  next();
});




// --- Auth (API Key)
const API_KEY = process.env.API_KEY || "dev-api-key-change-me";

function apiKeyRequired(req, res, next) {
  const hdr = req.headers["x-api-key"] || "";
  const auth = req.headers["authorization"] || "";
  const m = auth.match(/^ApiKey\s+(.+)$/i);
  const provided = hdr || (m ? m[1] : "");
  if (!provided) return res.status(401).json({ error: "missing API key" });
  if (provided !== API_KEY) return res.status(401).json({ error: "invalid API key" });
  return next();
}

// --- Health
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, uptimeSec: Math.round(process.uptime()), startedAt: metrics.startedAt });
});

// --- USERS CRUD
app.get("/api/users", (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  if (q) {
    return res.json(users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
  }
  res.json(users);
});

app.post("/api/users", apiKeyRequired, (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: "name and email are required" });
  const user = { id: makeId(), name, email };
  users.push(user);
  res.status(201).json(user);
});

app.get("/api/users/:id", (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "user not found" });
  res.json(user);
});

app.patch("/api/users/:id", apiKeyRequired, (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "user not found" });
  const { name, email } = req.body || {};
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  res.json(user);
});

app.delete("/api/users/:id", apiKeyRequired, (req, res) => {
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "user not found" });
  const [removed] = users.splice(idx, 1);
  // also cascade delete user's todos
  for (let i = todos.length - 1; i >= 0; i--) {
    if (todos[i].userId === removed.id) todos.splice(i, 1);
  }
  res.json({ ok: true });
});

// --- TODOS CRUD
app.get("/api/todos", (req, res) => {
  const { userId, completed } = req.query;
  let list = [...todos];
  if (userId) list = list.filter(t => t.userId === userId);
  if (completed !== undefined) {
    if (completed === "true") list = list.filter(t => t.completed === true);
    else if (completed === "false") list = list.filter(t => t.completed === false);
  }
  res.json(list);
});

app.post("/api/todos", apiKeyRequired, (req, res) => {
  const { userId, title, completed = false } = req.body || {};
  if (!userId || !title) return res.status(400).json({ error: "userId and title are required" });
  if (!users.find(u => u.id === userId)) return res.status(400).json({ error: "invalid userId" });
  const todo = { id: makeId(), userId, title, completed: !!completed };
  todos.push(todo);
  res.status(201).json(todo);
});

app.get("/api/todos/:id", (req, res) => {
  const todo = todos.find(t => t.id === req.params.id);
  if (!todo) return res.status(404).json({ error: "todo not found" });
  res.json(todo);
});

app.patch("/api/todos/:id", apiKeyRequired, (req, res) => {
  const todo = todos.find(t => t.id === req.params.id);
  if (!todo) return res.status(404).json({ error: "todo not found" });
  const { title, completed, userId } = req.body || {};
  if (title !== undefined) todo.title = title;
  if (completed !== undefined) todo.completed = !!completed;
  if (userId !== undefined) {
    if (!users.find(u => u.id === userId)) return res.status(400).json({ error: "invalid userId" });
    todo.userId = userId;
  }
  res.json(todo);
});

app.delete("/api/todos/:id", apiKeyRequired, (req, res) => {
  const idx = todos.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "todo not found" });
  todos.splice(idx, 1);
  res.json({ ok: true });
});

// --- Stats for dashboard
app.get("/api/_stats", (_req, res) => {
  const byRoute = Object.entries(metrics.byRoute).map(([route, v]) => ({
    route,
    count: v.count,
    avgMs: v.count ? +(v.totalMs / v.count).toFixed(1) : 0,
    statuses: v.statuses,
  })).sort((a,b) => b.count - a.count);
  res.json({
    startedAt: metrics.startedAt,
    uptimeSec: Math.round(process.uptime()),
    totalRequests: metrics.totalRequests,
    routes: byRoute,
    recent: metrics.recent.slice(-20).reverse(),
  });
});

// --- Simple landing
app.get("/", (_req, res) => {
  res.type("html").send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>REST API Demo</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <main class="container">
          <h1>REST API Demo</h1>
          <p>Example endpoints:</p>
          <ul>
            <li><a href="/api/health" target="_blank">GET /api/health</a></li>
            <li><a href="/api/users" target="_blank">GET /api/users</a></li>
            <li><a href="/api/todos" target="_blank">GET /api/todos</a></li>
            <li><a href="/dashboard" target="_blank">Dashboard</a></li>
          </ul>
          <p>This app keeps data in memory. Restarting the server resets the data.</p>
        </main>
      </body>
    </html>
  `);
});

// --- Dashboard
app.get("/dashboard", (_req, res) => {
  res.sendFile(process.cwd() + "/public/dashboard.html");
});

app.listen(PORT, () => {
  console.log(`REST API Demo listening on http://localhost:${PORT}`);
});


/** OpenAPI + Docs */
app.get("/openapi.json", (_req, res) => {
  res.sendFile(process.cwd() + "/public/openapi.json");
});
app.get("/docs", (_req, res) => {
  res.sendFile(process.cwd() + "/public/docs.html");
});
