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

// use Maps keyed by id for quick lookup
const users = new Map();
const alice = { id: makeId(), name: "Alice", email: "alice@example.com" };
const bob = { id: makeId(), name: "Bob", email: "bob@example.com" };
users.set(alice.id, alice);
users.set(bob.id, bob);

const todos = new Map();
[
  { id: makeId(), userId: alice.id, title: "Buy coffee", completed: false },
  { id: makeId(), userId: alice.id, title: "Edit wedding photos", completed: true },
  { id: makeId(), userId: bob.id, title: "Prepare client proposal", completed: false },
].forEach(t => todos.set(t.id, t));

// --- Simple metrics middleware
const RECENT_SIZE = 100;
const metrics = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  byRoute: {}, // routeKey -> { count, statuses: {200: n, ...}, totalMs }
  recent: new Array(RECENT_SIZE), // circular buffer of recent requests
  recentIndex: 0,
  recentCount: 0,
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

    const entry = {
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(ms),
    };
    metrics.recent[metrics.recentIndex] = entry;
    metrics.recentIndex = (metrics.recentIndex + 1) % RECENT_SIZE;
    if (metrics.recentCount < RECENT_SIZE) metrics.recentCount += 1;
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
  let list = Array.from(users.values());
  if (q) {
    list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  res.json(list);
});

app.post("/api/users", apiKeyRequired, (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: "name and email are required" });
  const user = { id: makeId(), name, email };
  users.set(user.id, user);
  res.status(201).json(user);
});

app.get("/api/users/:id", (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: "user not found" });
  res.json(user);
});

app.patch("/api/users/:id", apiKeyRequired, (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: "user not found" });
  const { name, email } = req.body || {};
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  res.json(user);
});

app.delete("/api/users/:id", apiKeyRequired, (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: "user not found" });
  users.delete(req.params.id);
  // also cascade delete user's todos
  for (const [id, todo] of todos) {
    if (todo.userId === req.params.id) todos.delete(id);
  }
  res.json({ ok: true });
});

// --- TODOS CRUD
app.get("/api/todos", (req, res) => {
  const { userId, completed } = req.query;
  let list = Array.from(todos.values());
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
  if (!users.get(userId)) return res.status(400).json({ error: "invalid userId" });
  const todo = { id: makeId(), userId, title, completed: !!completed };
  todos.set(todo.id, todo);
  res.status(201).json(todo);
});

app.get("/api/todos/:id", (req, res) => {
  const todo = todos.get(req.params.id);
  if (!todo) return res.status(404).json({ error: "todo not found" });
  res.json(todo);
});

app.patch("/api/todos/:id", apiKeyRequired, (req, res) => {
  const todo = todos.get(req.params.id);
  if (!todo) return res.status(404).json({ error: "todo not found" });
  const { title, completed, userId } = req.body || {};
  if (title !== undefined) todo.title = title;
  if (completed !== undefined) todo.completed = !!completed;
  if (userId !== undefined) {
    if (!users.get(userId)) return res.status(400).json({ error: "invalid userId" });
    todo.userId = userId;
  }
  res.json(todo);
});

app.delete("/api/todos/:id", apiKeyRequired, (req, res) => {
  const todo = todos.get(req.params.id);
  if (!todo) return res.status(404).json({ error: "todo not found" });
  todos.delete(req.params.id);
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
  const recent = [];
  const count = Math.min(metrics.recentCount, RECENT_SIZE);
  for (let i = 0; i < Math.min(20, count); i++) {
    const idx = (metrics.recentIndex - 1 - i + RECENT_SIZE) % RECENT_SIZE;
    const item = metrics.recent[idx];
    if (item) recent.push(item);
  }
  res.json({
    startedAt: metrics.startedAt,
    uptimeSec: Math.round(process.uptime()),
    totalRequests: metrics.totalRequests,
    routes: byRoute,
    recent,
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
