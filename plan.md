# Subscription Tracker App - Implementation Guide

A local-first app to track subscriptions, measure actual usage, and make data-driven decisions about what to keep or cancel.

---

## 1. Tech Stack & Architecture

### Recommended Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Runtime** | Bun | Fast, TypeScript-native, built-in SQLite bindings |
| **Framework** | Next.js 14+ (App Router) | Familiar, great DX, easy to add API routes for integrations |
| **Database** | SQLite via `better-sqlite3` or `bun:sqlite` | Local-first, zero config, portable, easy backups |
| **ORM** | Drizzle ORM | Type-safe, lightweight, excellent SQLite support |
| **UI** | React + Tailwind + shadcn/ui | Fast to build, good defaults, accessible components |
| **State** | Zustand + React Query | Simple state management, caching for any API calls |
| **Charts** | Recharts or Tremor | Usage trends, spending visualizations |
| **Date Handling** | date-fns | Lightweight, tree-shakeable |

### Architecture Decisions

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js App                          │
├─────────────────────────────────────────────────────────────┤
│  UI Layer (React + shadcn/ui)                               │
│  ├── Dashboard (overview, alerts, quick actions)            │
│  ├── Subscriptions (CRUD, details, usage logging)           │
│  ├── Analytics (trends, comparisons, ROI)                   │
│  └── Decisions (recommendations, cancellation tracker)      │
├─────────────────────────────────────────────────────────────┤
│  API Routes (/api/*)                                        │
│  ├── /api/subscriptions (CRUD)                              │
│  ├── /api/usage (log usage, fetch stats)                    │
│  ├── /api/integrations (OAuth callbacks, webhooks)          │
│  └── /api/analyze (trigger analysis, get recommendations)   │
├─────────────────────────────────────────────────────────────┤
│  Service Layer                                              │
│  ├── SubscriptionService (business logic)                   │
│  ├── UsageTracker (automated + manual tracking)             │
│  ├── CostAnalyzer (ROI, cost-per-use calculations)          │
│  └── RecommendationEngine (identify cuts, overlaps)         │
├─────────────────────────────────────────────────────────────┤
│  Data Layer (Drizzle + SQLite)                              │
│  └── subscriptions.db (local file)                          │
└─────────────────────────────────────────────────────────────┘
```

### Why Local-First?

- **Privacy**: Subscription data is sensitive (reveals spending habits, services used)
- **Speed**: No network latency for core operations
- **Reliability**: Works offline, no dependency on external services
- **Portability**: Single file backup, easy to sync across machines via Dropbox/iCloud
- **Cost**: No hosting costs for database

---

## 2. Data Model Design

### Core Schema (Drizzle)

```typescript
// src/db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Main subscription record
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(), // nanoid
  name: text('name').notNull(),
  description: text('description'),

  // Cost & Billing
  costCents: integer('cost_cents').notNull(), // Store in cents to avoid float issues
  currency: text('currency').default('USD'),
  billingFrequency: text('billing_frequency').notNull(), // 'monthly' | 'yearly' | 'weekly' | 'one-time'
  billingDay: integer('billing_day'), // Day of month (1-31) or day of week (0-6)
  nextBillingDate: integer('next_billing_date'), // Unix timestamp

  // Categorization
  category: text('category'), // 'streaming', 'productivity', 'gaming', 'news', 'fitness', etc.
  tags: text('tags'), // JSON array of custom tags

  // Usage tracking config
  usageTrackingType: text('usage_tracking_type').notNull(), // 'manual' | 'api' | 'browser' | 'email'
  usageTrackingConfig: text('usage_tracking_config'), // JSON config for automated tracking
  expectedUsagePerMonth: integer('expected_usage_per_month'), // How often you expect to use it

  // Cancellation info
  cancellationDifficulty: text('cancellation_difficulty'), // 'easy' | 'medium' | 'hard' | 'nightmare'
  cancellationNotes: text('cancellation_notes'), // "Requires phone call", "Must cancel 30 days before renewal"
  cancellationUrl: text('cancellation_url'),
  contractEndDate: integer('contract_end_date'), // For annual commitments

  // Status
  status: text('status').default('active'), // 'active' | 'paused' | 'cancelled' | 'trial'
  trialEndDate: integer('trial_end_date'),

  // Metadata
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  iconUrl: text('icon_url'),
  websiteUrl: text('website_url'),
});

// Individual usage events
export const usageEvents = sqliteTable('usage_events', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id),

  timestamp: integer('timestamp').notNull(),
  source: text('source').notNull(), // 'manual' | 'api' | 'browser' | 'email' | 'import'

  // Flexible usage data
  usageType: text('usage_type'), // 'session', 'action', 'content_consumed', 'feature_used'
  quantity: real('quantity').default(1), // For countable things (articles read, hours watched)
  unit: text('unit'), // 'hours', 'articles', 'sessions', 'gb', etc.

  // Optional context
  notes: text('notes'),
  metadata: text('metadata'), // JSON for source-specific data
});

// Aggregated usage stats (computed periodically)
export const usageStats = sqliteTable('usage_stats', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id),

  periodType: text('period_type').notNull(), // 'day' | 'week' | 'month'
  periodStart: integer('period_start').notNull(),

  totalEvents: integer('total_events').default(0),
  totalQuantity: real('total_quantity').default(0),

  // Computed metrics
  costPerUse: real('cost_per_use'), // Cost for this period / events
  valueScore: real('value_score'), // 0-100 based on usage vs cost
});

// Categories with overlap detection
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  parentId: text('parent_id'), // For hierarchical categories

  // For overlap detection
  similarCategories: text('similar_categories'), // JSON array of related category IDs
});

// Service overlap mappings (e.g., Netflix and Hulu both do streaming)
export const serviceOverlaps = sqliteTable('service_overlaps', {
  id: text('id').primaryKey(),
  subscriptionId1: text('subscription_id_1').notNull().references(() => subscriptions.id),
  subscriptionId2: text('subscription_id_2').notNull().references(() => subscriptions.id),

  overlapType: text('overlap_type'), // 'full' | 'partial' | 'complementary'
  overlapPercentage: integer('overlap_percentage'), // 0-100, how much they overlap
  notes: text('notes'), // "Both have Marvel content"

  createdAt: integer('created_at').notNull(),
});

// Decision log (track when you evaluated subscriptions)
export const decisionLog = sqliteTable('decision_log', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id),

  decisionDate: integer('decision_date').notNull(),
  decision: text('decision').notNull(), // 'keep' | 'cancel' | 'downgrade' | 'pause' | 'review_later'
  reasoning: text('reasoning'),

  // Snapshot of metrics at decision time
  costAtDecision: integer('cost_at_decision'),
  usageAtDecision: real('usage_at_decision'),
  valueScoreAtDecision: real('value_score_at_decision'),

  // Follow-up
  reviewDate: integer('review_date'), // When to reconsider
});

// Integration tokens (for API-based tracking)
export const integrations = sqliteTable('integrations', {
  id: text('id').primaryKey(),
  serviceName: text('service_name').notNull(), // 'spotify', 'netflix', 'github', etc.

  accessToken: text('access_token'), // Encrypted
  refreshToken: text('refresh_token'), // Encrypted
  expiresAt: integer('expires_at'),

  lastSyncAt: integer('last_sync_at'),
  syncStatus: text('sync_status'), // 'active' | 'error' | 'expired'
  syncError: text('sync_error'),
});
```

### Key Indexes

```typescript
// src/db/indexes.ts
export const subscriptionsByStatus = index('idx_subscriptions_status').on(subscriptions.status);
export const subscriptionsByNextBilling = index('idx_subscriptions_next_billing').on(subscriptions.nextBillingDate);
export const usageEventsBySubscription = index('idx_usage_events_subscription').on(usageEvents.subscriptionId);
export const usageEventsByTimestamp = index('idx_usage_events_timestamp').on(usageEvents.timestamp);
export const usageStatsByPeriod = index('idx_usage_stats_period').on(usageStats.subscriptionId, usageStats.periodStart);
```

---

## 3. Feature Prioritization

### MVP (Phase 1) - Core Tracking

Must-haves to start using the app yourself:

| Feature | Priority | Effort |
|---------|----------|--------|
| Add/edit/delete subscriptions | P0 | S |
| Manual usage logging (quick "I used this today" button) | P0 | S |
| Dashboard with total monthly/yearly spend | P0 | S |
| List view with next billing dates | P0 | S |
| Basic cost-per-use calculation | P0 | M |
| Category assignment | P1 | S |
| Billing reminders (upcoming renewals) | P1 | M |
| Data export (JSON/CSV) | P1 | S |

### Phase 2 - Usage Intelligence

| Feature | Priority | Effort |
|---------|----------|--------|
| Usage trend charts (per subscription) | P1 | M |
| "Haven't used in X days" alerts | P1 | S |
| Value score calculation | P1 | M |
| Spending by category breakdown | P1 | S |
| Service overlap detection (manual tagging) | P2 | M |
| Cancellation difficulty tracking | P2 | S |

### Phase 3 - Automated Tracking

| Feature | Priority | Effort |
|---------|----------|--------|
| Browser extension for usage detection | P2 | L |
| Spotify API integration | P2 | M |
| GitHub/GitLab API integration | P2 | M |
| Email parsing for usage reports | P3 | L |
| MCP server for AI assistant integration | P3 | M |

### Phase 4 - Decision Engine

| Feature | Priority | Effort |
|---------|----------|--------|
| Recommendation engine ("consider cancelling") | P2 | M |
| ROI comparisons between overlapping services | P2 | M |
| Decision logging with reasoning | P2 | S |
| Cancellation workflow tracker | P2 | M |
| "What if I cancelled X?" projections | P3 | S |
| Seasonal pattern detection | P3 | M |

### Nice-to-Haves (Backlog)

- Mobile app (React Native or PWA)
- Family plan splitting calculations
- Price increase detection
- Alternative service suggestions
- Sync across devices (CRDTs or simple cloud backup)
- Receipt/invoice storage
- Subscription discovery from bank statements

---

## 4. Implementation Phases with Milestones

### Phase 1: Foundation (Week 1-2)

**Goal**: Basic CRUD app you can start using immediately

```
Milestone 1.1: Project Setup
├── Initialize Next.js with Bun
├── Set up Drizzle + SQLite
├── Create base schema (subscriptions table only)
├── Set up shadcn/ui components
└── Create basic layout shell

Milestone 1.2: Subscription Management
├── Subscription list page
├── Add subscription form (modal or page)
├── Edit subscription
├── Delete with confirmation
└── View subscription details

Milestone 1.3: Dashboard v1
├── Total monthly spend card
├── Total yearly spend card
├── Upcoming bills (next 30 days)
├── Quick stats (active count, categories)
└── Recent subscriptions list

Milestone 1.4: Manual Usage Tracking
├── "Log usage" quick action button
├── Usage history on subscription detail page
├── Simple cost-per-use display
└── Basic usage streak indicator
```

**Deliverable**: Working app where you can add subscriptions and log usage manually.

### Phase 2: Analytics & Insights (Week 3-4)

**Goal**: Visualize usage patterns and identify waste

```
Milestone 2.1: Usage Stats Engine
├── Background job to compute daily/weekly/monthly stats
├── Value score algorithm implementation
├── Cost-per-use calculations
└── Store computed stats in usage_stats table

Milestone 2.2: Visualization
├── Usage trend chart (per subscription)
├── Spending by category pie/bar chart
├── Monthly spending trend over time
├── Cost-per-use leaderboard

Milestone 2.3: Alerts & Flags
├── "No usage in X days" detection
├── Trial ending soon warnings
├── Upcoming price changes
├── Flag subscriptions below value threshold
└── Notification preferences

Milestone 2.4: Overlap Detection
├── Overlap tagging UI
├── Side-by-side comparison view
├── Combined cost for similar services
└── "You pay $X for streaming services" summaries
```

**Deliverable**: Analytics dashboard that surfaces actionable insights.

### Phase 3: Automated Tracking (Week 5-8)

**Goal**: Reduce manual logging burden

```
Milestone 3.1: Browser Extension (Chrome)
├── Content script to detect service domains
├── Track time spent on subscription websites
├── Sync events to main app via local API
├── Extension popup with quick log button
└── Domain-to-subscription mapping config

Milestone 3.2: API Integrations Framework
├── OAuth flow infrastructure
├── Token storage (encrypted)
├── Background sync scheduler
├── Integration status dashboard
└── Error handling and retry logic

Milestone 3.3: Spotify Integration
├── OAuth with Spotify API
├── Fetch recently played tracks
├── Calculate listening hours
├── Auto-log daily usage stats

Milestone 3.4: GitHub Integration
├── OAuth with GitHub API
├── Fetch contribution activity
├── Track Copilot usage (if available via API)
├── Correlate with GitHub subscription cost

Milestone 3.5: Email Parsing (Optional)
├── Connect Gmail/Outlook API
├── Parse usage summary emails
├── Extract viewing stats from Netflix emails
├── Handle multiple email formats per service
```

**Deliverable**: Automated tracking for key subscriptions, reduced manual work.

### Phase 4: Decision Engine (Week 9-10)

**Goal**: Actionable recommendations and workflow support

```
Milestone 4.1: Recommendation Engine
├── Scoring algorithm for "consider cancelling"
├── Factor in: usage, cost, overlap, difficulty
├── Weekly recommendation email/notification
├── "Quick wins" (easy cancellations, low usage)

Milestone 4.2: Decision Workflow
├── Decision log with reasoning capture
├── Set review reminders
├── Track decision outcomes
├── Cancellation checklist per subscription
└── "Money saved since cancelling" tracker

Milestone 4.3: ROI Analysis
├── Cost vs industry average comparison
├── "Value per dollar" rankings
├── Hypothetical savings calculator
├── Annual review summary generator
```

**Deliverable**: Complete decision-making toolkit.

---

## 5. Automated Usage Tracking Approaches

### Tier 1: API Integrations (Most Reliable)

| Service | API Availability | Data Points |
|---------|-----------------|-------------|
| **Spotify** | Excellent | Listening history, hours, top artists |
| **GitHub** | Excellent | Commits, PRs, Copilot usage (limited) |
| **Strava** | Good | Activities, frequency |
| **Todoist** | Good | Tasks completed |
| **Notion** | Limited | Page views (via embed tracking) |
| **Slack** | Limited | Messages sent (workspace admin needed) |

**Implementation Pattern:**

```typescript
// src/lib/integrations/spotify.ts
interface SpotifyIntegration {
  authenticate(): Promise<void>;
  fetchRecentlyPlayed(since: Date): Promise<PlayedTrack[]>;
  calculateUsageHours(tracks: PlayedTrack[]): number;
}

export class SpotifyTracker implements SpotifyIntegration {
  async syncUsage(subscriptionId: string) {
    const lastSync = await this.getLastSyncDate(subscriptionId);
    const tracks = await this.fetchRecentlyPlayed(lastSync);

    const hours = this.calculateUsageHours(tracks);

    await db.insert(usageEvents).values({
      id: nanoid(),
      subscriptionId,
      timestamp: Date.now(),
      source: 'api',
      usageType: 'session',
      quantity: hours,
      unit: 'hours',
      metadata: JSON.stringify({ trackCount: tracks.length }),
    });
  }
}
```

### Tier 2: Browser Extension (Good for Web-Only Services)

**Target Services**: Netflix, Hulu, Disney+, YouTube Premium, news sites, productivity tools

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Extension                         │
├─────────────────────────────────────────────────────────────┤
│  Content Script                                              │
│  ├── Detect current domain                                   │
│  ├── Track active tab time (visibility API)                  │
│  ├── Optional: Detect specific actions (play button, etc.)   │
│  └── Send events to background script                        │
├─────────────────────────────────────────────────────────────┤
│  Background Script                                           │
│  ├── Aggregate events                                        │
│  ├── Batch send to local app API (localhost:3000/api/usage)  │
│  └── Handle offline queuing                                  │
├─────────────────────────────────────────────────────────────┤
│  Popup                                                       │
│  ├── Quick manual log button                                 │
│  ├── Today's usage summary                                   │
│  └── Settings (domain mappings)                              │
└─────────────────────────────────────────────────────────────┘
```

**Domain Mapping Config:**

```typescript
// In extension settings or synced from main app
const domainMappings = {
  'netflix.com': 'sub_netflix_123',
  'open.spotify.com': 'sub_spotify_456',
  'github.com': 'sub_github_789',
  'notion.so': 'sub_notion_012',
  // User-configurable
};
```

### Tier 3: Email Parsing (Periodic Usage Reports)

Many services send usage summary emails:

| Service | Email Type | Frequency |
|---------|-----------|-----------|
| Netflix | "What you watched" | Monthly |
| Spotify | Wrapped, monthly stats | Yearly/Monthly |
| Audible | Listening stats | Monthly |
| Kindle Unlimited | Books read | Monthly |
| Apple (Screen Time) | Weekly report | Weekly |

**Implementation Approach:**

```typescript
// src/lib/integrations/email-parser.ts
interface EmailParser {
  serviceId: string;
  patterns: {
    sender: string[];
    subjectContains: string[];
  };
  parse(emailBody: string): UsageData | null;
}

const netflixParser: EmailParser = {
  serviceId: 'netflix',
  patterns: {
    sender: ['info@netflix.com'],
    subjectContains: ['watched', 'viewing activity'],
  },
  parse(body) {
    // Extract hours watched, shows viewed
    const hoursMatch = body.match(/(\d+)\s*hours?\s*watched/i);
    return hoursMatch ? { hours: parseInt(hoursMatch[1]) } : null;
  },
};
```

### Tier 4: Manual with Smart Prompts

For services without automation, make manual logging frictionless:

1. **Quick Actions**: One-tap "I used [Service] today"
2. **Smart Reminders**: "Did you use Spotify today?" at 9 PM
3. **Contextual Prompts**: After visiting Netflix.com, prompt to log
4. **Batch Entry**: Weekly review to fill in gaps
5. **Default Patterns**: "I always use Gym on Mon/Wed/Fri" - auto-suggest

```typescript
// Quick usage logging
export function QuickLogButton({ subscription }: Props) {
  const logUsage = useMutation(/* ... */);

  return (
    <Button
      onClick={() => logUsage.mutate({
        subscriptionId: subscription.id,
        quantity: 1,
        source: 'manual'
      })}
    >
      ✓ Used today
    </Button>
  );
}
```

---

## 6. UI/UX Considerations

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│  SUBSCRIPTION TRACKER                      [+Add] [Settings]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ $247/month  │ │ $2,964/year │ │ 23 Active   │           │
│  │ Total Spend │ │ Yearly Cost │ │Subscriptions│           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                             │
│  ⚠️ NEEDS ATTENTION                                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 🔴 Adobe CC - No usage in 45 days ($55/mo)           │  │
│  │ 🟡 NYTimes - Trial ends in 3 days                     │  │
│  │ 🟡 Gym - Cost per visit: $47 (target: $15)           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  UPCOMING BILLS (Next 14 days)                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Jan 15  Spotify Family     $16.99                     │  │
│  │ Jan 18  Netflix            $15.49                     │  │
│  │ Jan 22  iCloud 200GB       $2.99                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  VALUE RANKINGS                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 🟢 95  Spotify ($0.12/hour listened)                  │  │
│  │ 🟢 88  GitHub Pro ($8/300 commits this month)         │  │
│  │ 🟡 45  Hulu ($4.20/show watched)                      │  │
│  │ 🔴 12  MasterClass ($12/lesson, used 1x)              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Subscription Detail Page

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                                                     │
│                                                             │
│  [Netflix Logo]  NETFLIX                          [Edit]    │
│  Streaming · Active                                         │
│                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ $15.49/mo   │ │ $1.29/use   │ │ 72 Value    │           │
│  │    Cost     │ │Cost per Use │ │   Score     │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                             │
│  [LOG USAGE: I watched something today ✓]                   │
│                                                             │
│  USAGE THIS MONTH                                           │
│  ████████████░░░░░░░░ 12 sessions                          │
│  vs last month: ▲ 3 more                                    │
│                                                             │
│  USAGE TREND (6 months)                                     │
│  [Line chart showing usage over time]                       │
│                                                             │
│  SIMILAR SERVICES YOU PAY FOR                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Hulu ($8/mo) - 60% content overlap                   │  │
│  │ Disney+ ($11/mo) - 20% content overlap               │  │
│  │ Combined: $34.49/mo for streaming                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  CANCELLATION INFO                                          │
│  Difficulty: Easy (online, immediate)                       │
│  [Cancel Subscription →]                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Decision Workflow Modal

```
┌─────────────────────────────────────────────────────────────┐
│  EVALUATE: Adobe Creative Cloud                    [X]      │
│                                                             │
│  Current Status                                             │
│  • Cost: $55/month ($660/year)                              │
│  • Last used: 47 days ago                                   │
│  • Usage this quarter: 3 sessions                           │
│  • Cost per use: $55.00 (!)                                 │
│                                                             │
│  Our Analysis                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 🔴 HIGH PRIORITY TO REVIEW                            │  │
│  │                                                        │  │
│  │ You've paid $165 over 3 months but only used it 3x.   │  │
│  │ At current usage, you're paying $55 per session.      │  │
│  │                                                        │  │
│  │ Alternatives:                                          │  │
│  │ • Affinity Suite: $170 one-time (pays off in 3 mo)    │  │
│  │ • Figma: Free tier may cover your needs               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  What do you want to do?                                    │
│                                                             │
│  [Keep - I'll use it more]  [Pause Subscription]            │
│  [Cancel Now]  [Remind me in 30 days]                       │
│                                                             │
│  Add notes about your decision:                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Keeping for now - have a video project next month     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key UX Principles

1. **Reduce Friction for Logging**
   - One-tap usage logging
   - Keyboard shortcuts (Cmd+L for quick log)
   - Browser extension passive tracking
   - Smart defaults ("Same as yesterday?")

2. **Make the Painful Obvious**
   - Red/yellow/green value scoring
   - "Money wasted" calculations prominently displayed
   - Comparative cost-per-use ("Your gym costs $47/visit vs $5 at Planet Fitness")

3. **Celebrate Good Decisions**
   - "You've saved $X since cancelling Y"
   - "Your Spotify costs just $0.12/hour - great value!"
   - Streaks for consistent usage of subscriptions

4. **Don't Overwhelm**
   - Progressive disclosure (summary → details → full history)
   - Weekly digest email instead of constant notifications
   - Batch review workflow for multiple subscriptions

5. **Support the Full Lifecycle**
   - Add → Track → Evaluate → Decide → Cancel/Keep → Review
   - Don't just identify problems; help solve them
   - Track cancellation success and savings

---

## 7. Value Score Algorithm

### Formula

```typescript
function calculateValueScore(subscription: Subscription, stats: UsageStats): number {
  // Base score from usage frequency
  const usageScore = calculateUsageScore(stats, subscription.expectedUsagePerMonth);

  // Adjust for cost efficiency
  const costScore = calculateCostScore(stats.costPerUse, getCategoryBenchmark(subscription.category));

  // Adjust for overlap
  const overlapPenalty = calculateOverlapPenalty(subscription);

  // Adjust for trend
  const trendBonus = calculateTrendBonus(stats.usageTrend);

  // Combine with weights
  const rawScore = (
    usageScore * 0.4 +
    costScore * 0.3 +
    (100 - overlapPenalty) * 0.15 +
    (50 + trendBonus) * 0.15
  );

  return Math.round(Math.max(0, Math.min(100, rawScore)));
}

function calculateUsageScore(stats: UsageStats, expected: number): number {
  if (!expected) return stats.totalEvents > 0 ? 50 : 0;
  const ratio = stats.totalEvents / expected;
  // 100% of expected = 80 points, 150%+ = 100 points
  return Math.min(100, ratio * 80);
}

function calculateCostScore(costPerUse: number, benchmark: number): number {
  if (!benchmark) return 50;
  // At or below benchmark = 100, 2x benchmark = 50, 5x+ = 0
  const ratio = costPerUse / benchmark;
  return Math.max(0, 100 - (ratio - 1) * 25);
}
```

### Category Benchmarks

```typescript
const categoryBenchmarks: Record<string, { costPerUse: number; unit: string }> = {
  streaming: { costPerUse: 2.00, unit: 'show/movie' },
  music: { costPerUse: 0.20, unit: 'hour' },
  fitness: { costPerUse: 10.00, unit: 'session' },
  productivity: { costPerUse: 1.00, unit: 'day' },
  news: { costPerUse: 0.50, unit: 'article' },
  gaming: { costPerUse: 1.00, unit: 'hour' },
  education: { costPerUse: 5.00, unit: 'lesson' },
};
```

---

## 8. MCP Server for AI Integration

Build an MCP server so AI assistants can query your subscription data:

```typescript
// src/mcp/subscription-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({
  name: 'subscription-tracker',
  version: '1.0.0',
});

// Tool: Get spending summary
server.tool('get_spending_summary', {
  period: { type: 'string', enum: ['month', 'year'] }
}, async ({ period }) => {
  const data = await getSpendingSummary(period);
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
});

// Tool: Find subscriptions to cut
server.tool('find_subscriptions_to_cut', {
  min_savings: { type: 'number', description: 'Minimum monthly savings' }
}, async ({ min_savings }) => {
  const recommendations = await getRecommendations(min_savings);
  return { content: [{ type: 'text', text: JSON.stringify(recommendations) }] };
});

// Tool: Log usage
server.tool('log_usage', {
  subscription_name: { type: 'string' },
  notes: { type: 'string', optional: true }
}, async ({ subscription_name, notes }) => {
  await logUsage(subscription_name, notes);
  return { content: [{ type: 'text', text: 'Usage logged' }] };
});

// Resource: Current subscriptions
server.resource('subscriptions://all', async () => {
  const subs = await getAllSubscriptions();
  return { contents: [{ uri: 'subscriptions://all', text: JSON.stringify(subs) }] };
});
```

**Use Cases:**
- "Hey Claude, how much am I spending on subscriptions?"
- "Which subscriptions should I cancel to save $100/month?"
- "Log that I used Netflix today"
- "What's my most wasteful subscription?"

---

## 9. Project Structure

```
subscription-tracker/
├── src/
│   ├── app/                      # Next.js app router
│   │   ├── page.tsx              # Dashboard
│   │   ├── subscriptions/
│   │   │   ├── page.tsx          # List view
│   │   │   ├── [id]/page.tsx     # Detail view
│   │   │   └── new/page.tsx      # Add form
│   │   ├── analytics/page.tsx    # Charts and insights
│   │   ├── decisions/page.tsx    # Recommendations
│   │   └── api/
│   │       ├── subscriptions/
│   │       ├── usage/
│   │       ├── integrations/
│   │       └── analyze/
│   ├── components/
│   │   ├── ui/                   # shadcn components
│   │   ├── subscriptions/
│   │   ├── charts/
│   │   └── decisions/
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts          # Database connection
│   │   │   ├── schema.ts         # Drizzle schema
│   │   │   └── migrations/
│   │   ├── services/
│   │   │   ├── subscription.ts
│   │   │   ├── usage.ts
│   │   │   ├── analytics.ts
│   │   │   └── recommendations.ts
│   │   ├── integrations/
│   │   │   ├── spotify.ts
│   │   │   ├── github.ts
│   │   │   └── email-parser.ts
│   │   └── utils/
│   │       ├── cost.ts           # Cost calculations
│   │       ├── dates.ts          # Date helpers
│   │       └── value-score.ts    # Scoring algorithm
│   └── mcp/                      # MCP server
│       └── subscription-server.ts
├── extension/                    # Browser extension
│   ├── manifest.json
│   ├── content.ts
│   ├── background.ts
│   └── popup/
├── drizzle.config.ts
├── package.json
└── README.md
```

---

## 10. Getting Started Commands

```bash
# Initialize project
bunx create-next-app@latest subscription-tracker --typescript --tailwind --app
cd subscription-tracker

# Add dependencies
bun add drizzle-orm better-sqlite3 @types/better-sqlite3
bun add nanoid date-fns zustand @tanstack/react-query
bun add -d drizzle-kit

# Add shadcn/ui
bunx shadcn-ui@latest init
bunx shadcn-ui@latest add button card input label select dialog table badge

# Set up database
mkdir -p src/lib/db
# Create schema.ts as defined above
bunx drizzle-kit generate:sqlite
bunx drizzle-kit push:sqlite

# Run development
bun dev
```

---

## 11. Success Metrics

Track these to know if the app is working:

1. **Adoption**: Are you actually logging usage consistently?
2. **Discovery**: Has it surfaced subscriptions you forgot about?
3. **Action**: How many subscriptions have you cancelled based on data?
4. **Savings**: Total money saved since starting to use the app
5. **Accuracy**: Do value scores feel right? Are recommendations actionable?

---

## Summary

Start with Phase 1 MVP - a basic CRUD app with manual usage logging. This gives you immediate value while you build out the more sophisticated features. The key insight is that even manual tracking with good visualizations beats no tracking at all.

The automation layers (browser extension, APIs) reduce friction over time, but the core value is in making your spending and usage visible, comparable, and actionable.
