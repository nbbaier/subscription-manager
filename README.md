# Subscription Manager - Phase 1 MVP

A local-first app to track subscriptions, measure actual usage, and make data-driven decisions about what to keep or cancel.

## Phase 1 Features (Implemented)

### Core Functionality
- ✅ **Subscription CRUD Operations** - Add, edit, view, and delete subscriptions
- ✅ **Manual Usage Logging** - Quick "I used this today" button for each subscription
- ✅ **Dashboard Overview** - Total monthly/yearly spend and active subscription count
- ✅ **Cost Tracking** - Store costs in cents to avoid floating-point issues
- ✅ **Usage Statistics** - Track usage events and calculate cost-per-use
- ✅ **Categories** - Organize subscriptions by category (streaming, productivity, etc.)
- ✅ **Local SQLite Database** - All data stored locally in `subscriptions.db`

### Tech Stack
- **Runtime**: Bun (fast, TypeScript-native, built-in SQLite)
- **Database**: SQLite via `bun:sqlite` (local-first, zero config)
- **Backend**: Bun HTTP server with REST API
- **Frontend**: Vanilla HTML/CSS/JavaScript (no build step required)
- **Language**: TypeScript throughout

## Project Structure

```
subscription-manager/
├── app/
│   ├── index.ts                       # Main HTTP server
│   └── lib/
│       ├── db/
│       │   ├── index.ts               # Database connection & initialization
│       │   └── schema.ts              # Database schema (reference)
│       └── services/
│           ├── subscription.ts        # Subscription business logic
│           └── usage.ts               # Usage tracking logic
├── public/
│   └── index.html                     # Web dashboard UI
├── subscriptions.db                   # SQLite database (created on first run)
├── package.json                       # Project configuration
└── README.md                          # This file
```

## Getting Started

### Prerequisites
- [Bun](https://bun.sh) installed (version 1.0+)

### Installation & Running

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/nbbaier/subscription-manager.git
   cd subscription-manager
   bun install
   ```

2. **Set up the database:**
   ```bash
   bun run db:push
   ```

3. **Start the development server:**
   ```bash
   bun run dev
   ```

4. **Open the app:**
   Visit [http://localhost:3000](http://localhost:3000) in your browser

The SQLite database (`subscriptions.db`) is created automatically and stored locally.

## API Documentation

### Subscriptions

#### List all subscriptions
```bash
GET /api/subscriptions
```

#### Get subscription stats
```bash
GET /api/subscriptions/stats
```
Returns: `{ monthlyTotal, yearlyTotal, activeCount }`

#### Get subscription by ID
```bash
GET /api/subscriptions/:id
```

#### Create subscription
```bash
POST /api/subscriptions
Content-Type: application/json

{
  "name": "Netflix",
  "description": "Streaming service",
  "costCents": 1549,
  "billingFrequency": "monthly",
  "category": "streaming"
}
```

#### Update subscription
```bash
PUT /api/subscriptions/:id
Content-Type: application/json

{
  "name": "Netflix Premium",
  "costCents": 1999
}
```

#### Delete subscription
```bash
DELETE /api/subscriptions/:id
```

### Usage Tracking

#### Log usage event
```bash
POST /api/subscriptions/:id/usage
Content-Type: application/json

{
  "quantity": 1,
  "notes": "Watched a movie"
}
```

#### Get usage events
```bash
GET /api/subscriptions/:id/usage
```

#### Get usage statistics
```bash
GET /api/subscriptions/:id/usage/stats
```
Returns:
```json
{
  "subscriptionId": "...",
  "totalEvents": 42,
  "lastUsed": 1767225391894,
  "daysSinceLastUse": 0,
  "usageThisMonth": 15,
  "costPerUse": 103.27
}
```

## Database Schema

### Subscriptions Table
- `id` - Unique identifier (nanoid)
- `name` - Subscription name
- `description` - Optional description
- `cost_cents` - Cost in cents (e.g., 1549 = $15.49)
- `currency` - Currency code (default: USD)
- `billing_frequency` - monthly | yearly | weekly | one-time
- `category` - streaming, productivity, gaming, etc.
- `status` - active | paused | cancelled | trial
- `usage_tracking_type` - manual | api | browser | email
- `created_at` / `updated_at` - Unix timestamps

### Usage Events Table
- `id` - Unique identifier (nanoid)
- `subscription_id` - Foreign key to subscriptions
- `timestamp` - When the usage occurred
- `source` - manual | api | browser | email | import
- `quantity` - Amount of usage (default: 1)
- `notes` - Optional notes about the usage
- `metadata` - JSON for additional data

## Example Usage

### Adding Subscriptions via API
```bash
# Add Netflix
curl -X POST http://localhost:3000/api/subscriptions \
  -H "Content-Type: application/json" \
  -d '{"name":"Netflix","costCents":1549,"billingFrequency":"monthly","category":"streaming"}'

# Add Spotify
curl -X POST http://localhost:3000/api/subscriptions \
  -H "Content-Type: application/json" \
  -d '{"name":"Spotify","costCents":1099,"billingFrequency":"monthly","category":"music"}'
```

### Logging Usage
```bash
# Log that you watched Netflix
curl -X POST http://localhost:3000/api/subscriptions/{id}/usage \
  -H "Content-Type: application/json" \
  -d '{"quantity":1,"notes":"Watched a show"}'
```

### Checking Stats
```bash
# Get overall statistics
curl http://localhost:3000/api/subscriptions/stats

# Get usage stats for a specific subscription
curl http://localhost:3000/api/subscriptions/{id}/usage/stats
```

## Features Implemented (Phase 1 Checklist)

- ✅ Add/edit/delete subscriptions
- ✅ Manual usage logging (quick "I used this today" button)
- ✅ Dashboard with total monthly/yearly spend
- ✅ List view with subscriptions
- ✅ Basic cost-per-use calculation
- ✅ Category assignment
- ✅ Local SQLite storage
- ✅ REST API
- ✅ Web UI

## Next Steps (Future Phases)

### Phase 2 - Usage Intelligence
- Usage trend charts
- "Haven't used in X days" alerts
- Value score calculation
- Spending by category breakdown
- Service overlap detection

### Phase 3 - Automated Tracking
- Browser extension for usage detection
- API integrations (Spotify, GitHub, etc.)
- Email parsing for usage reports

### Phase 4 - Decision Engine
- Recommendation engine ("consider cancelling")
- ROI comparisons
- Decision logging with reasoning
- Cancellation workflow tracker

## Development Notes

### Why No External Dependencies?
The initial implementation encountered npm registry access issues (401 errors), so Phase 1 was built using only Bun's built-in capabilities:
- `bun:sqlite` for database
- Native HTTP server
- Vanilla JavaScript for frontend
- Custom nanoid implementation

This actually aligns well with the local-first philosophy and keeps the app extremely lightweight!

### Data Privacy
All data is stored locally in `subscriptions.db`. No external services, no tracking, no cloud dependencies. Your subscription data stays on your machine.

### Backup & Portability
To backup your data, simply copy `subscriptions.db`. You can sync it across machines via Dropbox, iCloud, or any file sync service.

## License

MIT

## Contributing

This is Phase 1 of the implementation. See `plan.md` for the complete roadmap.
