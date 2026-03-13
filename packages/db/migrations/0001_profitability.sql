-- Recreate strategy_reports with correct schema (table was empty, previous schema had wrong column names)
DROP TABLE IF EXISTS `strategy_reports`;
--> statement-breakpoint
CREATE TABLE `strategy_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vault_id` integer NOT NULL,
	`strategy_address` text NOT NULL,
	`gain` text,
	`gain_usd` real,
	`loss_usd` real,
	`total_gain_usd` real,
	`total_loss_usd` real,
	`block_time` integer,
	`block_number` integer,
	`transaction_hash` text,
	`pricing_source` text,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Fee rate history (versioned) for accurate historical fee calculations
CREATE TABLE IF NOT EXISTS `fee_config_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vault_id` integer NOT NULL,
	`management_fee` real,
	`performance_fee` real,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE no action
);
