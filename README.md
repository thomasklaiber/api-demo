# REST API Demo (Node.js + Express)

Eine kleine Beispiel‑API zum **Üben von REST‑Basics** – mit Demo‑Datenmodell (Users & Todos), **CRUD‑Endpoints**, **API‑Key‑Auth** für Schreibzugriffe und einem **Mini‑Dashboard** zur Überwachung.

> Ziel: Einsteiger:innen sollen schnell Requests testen (GET/POST/PATCH/DELETE), typische Fehler verstehen und direkt ein Gefühl für eine API bekommen.

---

## 1) Schnellstart

**Voraussetzungen:** Node.js ≥ 18, npm

```bash
unzip rest-api-demo-apikey.zip
cd rest-api-demo
npm install
# optional: eigenen API-Key setzen, sonst Default
API_KEY=my-secret npm start
# öffne im Browser: http://localhost:3000/
```

- **Landing Page:** Übersicht & Links → `http://localhost:3000/`
- **Dashboard:** Live‑Stats → `http://localhost:3000/dashboard` (pollt `/api/_stats` alle 2s)

**Standard‑Ports/Variablen**
- `PORT` – Port der App (default: `3000`)
- `API_KEY` – Schlüssel für Schreibzugriffe (default: `dev-api-key-change-me`)

---

## 2) Datenmodell (Demo)

Die App nutzt **In‑Memory Daten** (gehen beim Neustart verloren).

### `User`
```json
{ "id": "1", "name": "Alice", "email": "alice@example.com" }
```

### `Todo`
```json
{ "id": "3", "userId": "1", "title": "Buy coffee", "completed": false }
```

Beziehungen:
- Ein `Todo` gehört zu genau **einem** `User` (`userId`).

---

## 3) Auth (API Key)

**Nur Schreib‑Operationen** sind geschützt (Create/Update/Delete). Lies‑Zugriffe sind öffentlich.

- Header **`X-API-Key: <key>`** **oder** `Authorization: ApiKey <key>`
- Setze deinen Key beim Start mit `API_KEY=my-secret npm start`

**Beispiel:**
```bash
curl -s -X POST http://localhost:3000/api/todos \
  -H "X-API-Key: my-secret" \
  -H "Content-Type: application/json" \
  -d '{"userId":"1","title":"Secured task"}'
```

---

## 4) Endpoints (mit Beispielen)

### Health
- `GET /api/health` → App‑Status
```json
{ "ok": true, "uptimeSec": 12, "startedAt": "2025-08-27T13:37:00.000Z" }
```

### Users
- `GET /api/users` – Liste (optional `?q=<search>`)
- `GET /api/users/:id` – Details
- `POST /api/users` *(schreibend → API‑Key)*
  - Body: `{ "name": "Charlie", "email": "charlie@example.com" }`
- `PATCH /api/users/:id` *(schreibend → API‑Key)*
  - Body: z. B. `{ "name": "New Name" }`
- `DELETE /api/users/:id` *(schreibend → API‑Key)*

**Beispiel (lesen):**
```bash
curl -s http://localhost:3000/api/users
curl -s "http://localhost:3000/api/users?q=ali"
```

**Beispiel (anlegen):**
```bash
curl -s -X POST http://localhost:3000/api/users \
  -H "X-API-Key: my-secret" \
  -H "Content-Type: application/json" \
  -d '{"name":"Charlie","email":"charlie@example.com"}'
```

### Todos
- `GET /api/todos` – Liste (Filter: `?userId=<id>&completed=true|false`)
- `GET /api/todos/:id` – Details
- `POST /api/todos` *(schreibend → API‑Key)*
  - Body: `{ "userId": "1", "title": "Task", "completed": false }`
- `PATCH /api/todos/:id` *(schreibend → API‑Key)*
- `DELETE /api/todos/:id` *(schreibend → API‑Key)*

**Beispiele (lesen):**
```bash
curl -s http://localhost:3000/api/todos
curl -s "http://localhost:3000/api/todos?userId=1"
curl -s "http://localhost:3000/api/todos?completed=true"
```

**Beispiel (ändern):**
```bash
# Todo 3 erledigt setzen
curl -s -X PATCH http://localhost:3000/api/todos/3 \
  -H "X-API-Key: my-secret" \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'
```

### Monitoring
- `GET /api/_stats` – JSON mit Metriken (Requests gesamt, per Route, letzte Requests)
- `GET /dashboard` – visuelles Dashboard (Chart + Tabellen)

---

## 5) Typische Fehler & Antworten

| Situation | Status | Antwort (Beispiel) |
|---|---:|---|
| Fehlender API‑Key bei Schreib‑Route | 401 | `{ "error": "missing API key" }` |
| Falscher API‑Key | 401 | `{ "error": "invalid API key" }` |
| Pflichtfeld fehlt (`name`, `email`, `userId`, `title`) | 400 | `{ "error": "name and email are required" }` |
| Ungültige `userId` beim Todo | 400 | `{ "error": "invalid userId" }` |
| Objekt nicht gefunden (`/users/:id`, `/todos/:id`) | 404 | `{ "error": "user not found" }` |

**Tipp:** In der Konsole (Server) siehst du durch `morgan` eine Request‑Logzeile pro Aufruf.

---

## 6) Mit Postman/Insomnia testen

1. **Neue Collection** anlegen, Basis‑URL `http://localhost:3000` setzen.
2. **GET‑Requests** ohne Auth testen (z. B. `/api/users`).
3. Für **POST/PATCH/DELETE** als Header hinzufügen:
   - `X-API-Key: my-secret` (oder `Authorization: ApiKey my-secret`)
4. Beim Body immer `Content-Type: application/json` und gültiges JSON schicken.

---

## 7) Projektstruktur

```
rest-api-demo/
├─ public/
│  ├─ dashboard.html   # Mini-Dashboard (Chart.js via CDN)
│  └─ style.css        # kleines Dark-Theme
├─ README.md           # diese Doku
├─ server.js           # Express-App (API, In-Memory-Daten, Metriken)
└─ package.json        # Dependencies, Scripts
```

---

## 8) Erweiterungen (Ideen)

- **Datenbank**: SQLite + Prisma (persistente Daten)
- **Rate Limiting**: z. B. `express-rate-limit`
- **CORS feinjustieren**: nur bestimmte Origins erlauben
- **Validation**: z. B. `zod`/`joi` für saubere Input‑Prüfung
- **Prometheus‑Export**: `/metrics` hinzufügen
- **OpenAPI (Swagger)**: automatische Doku & Try‑Out UI

---

## 9) Deployment (Beispiel Render)

1. Repo zu GitHub pushen.
2. In Render „Web Service“ → Node wählen.
3. **Build Command**: `npm install`  
   **Start Command**: `node server.js`
4. **Environment**: `API_KEY` setzen, optional `PORT`.
5. Deploy – fertig.

---

## 10) FAQ / Troubleshooting

**„POST liefert 401 Unauthorized“**  
→ API‑Key fehlt/ist falsch. Header `X-API-Key` prüfen. In der App‑Konsole sicherstellen, dass mit `API_KEY=my-secret npm start` gestartet wurde.

**„Daten verschwinden nach Neustart“**  
→ In‑Memory Demo. Für Persistenz DB einbauen (siehe Erweiterungen).

**„CORS Fehler im Browser“**  
→ `cors()` ist aktiv. Wenn du strenger konfigurieren möchtest, nur deine Origin erlauben.

**„Kann ich eigene Felder hinzufügen?“**  
→ Ja. In `server.js` das In‑Memory‑Schema erweitern und CRUD anpassen.


---

## OpenAPI / Swagger

- **Spec:** `GET /openapi.json`
- **UI:** `GET /docs` – interaktive Oberfläche zum Ausprobieren der Endpunkte (Swagger UI)
- **Tipp:** Für geschützte Endpunkte im **Authorize**‑Dialog `X-API-Key` setzen oder Header manuell ergänzen.
