CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cost_cents` integer NOT NULL,
	`currency` text DEFAULT 'USD',
	`billing_frequency` text NOT NULL,
	`billing_day` integer,
	`next_billing_date` integer,
	`category` text,
	`tags` text,
	`usage_tracking_type` text NOT NULL,
	`usage_tracking_config` text,
	`expected_usage_per_month` integer,
	`cancellation_difficulty` text,
	`cancellation_notes` text,
	`cancellation_url` text,
	`contract_end_date` integer,
	`status` text DEFAULT 'active',
	`trial_end_date` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`icon_url` text,
	`website_url` text
);
--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`source` text NOT NULL,
	`usage_type` text,
	`quantity` real DEFAULT 1,
	`unit` text,
	`notes` text,
	`metadata` text,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action
);
