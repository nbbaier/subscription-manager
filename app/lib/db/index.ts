// Database connection using bun:sqlite (built-in)
import { Database } from 'bun:sqlite';

const dbPath = process.env.DB_PATH || 'subscriptions.db';
export const db = new Database(dbPath, { create: true });

// Initialize database schema
export function initializeDatabase() {
  // Create subscriptions table
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      cost_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'USD',
      billing_frequency TEXT NOT NULL,
      billing_day INTEGER,
      next_billing_date INTEGER,
      category TEXT,
      tags TEXT,
      usage_tracking_type TEXT NOT NULL DEFAULT 'manual',
      usage_tracking_config TEXT,
      expected_usage_per_month INTEGER,
      cancellation_difficulty TEXT,
      cancellation_notes TEXT,
      cancellation_url TEXT,
      contract_end_date INTEGER,
      status TEXT DEFAULT 'active',
      trial_end_date INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      icon_url TEXT,
      website_url TEXT
    )
  `);

  // Create usage_events table
  db.run(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      source TEXT NOT NULL,
      usage_type TEXT,
      quantity REAL DEFAULT 1,
      unit TEXT,
      notes TEXT,
      metadata TEXT,
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
    )
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing ON subscriptions(next_billing_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_events_subscription ON usage_events(subscription_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp)`);

  console.log('Database initialized successfully');
}

// Helper function to generate nano ID (simple implementation)
export function nanoid(size: number = 21): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}
