CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`instructions` text NOT NULL,
	`default_category` text DEFAULT 'General' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prompt_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`agent_id` text,
	`version_label` text,
	`change_summary` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_prompt_versions_prompt_id` ON `prompt_versions` (`prompt_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`agent_id` text,
	`rating` real,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`family_id` text NOT NULL,
	`parent_prompt_id` text,
	`version_label` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_prompts_agent_id` ON `prompts` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_prompts_family_id` ON `prompts` (`family_id`);--> statement-breakpoint
CREATE INDEX `idx_prompts_updated_at` ON `prompts` (`updated_at`);--> statement-breakpoint
CREATE TABLE `remote_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`tool` text NOT NULL,
	`input_json` text NOT NULL,
	`summary` text NOT NULL,
	`ok` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_remote_activity_created_at` ON `remote_activity` (`created_at`);