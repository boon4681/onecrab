ALTER TABLE `providers` ADD `authorization_url` text;--> statement-breakpoint
ALTER TABLE `providers` ADD `token_url` text;--> statement-breakpoint
ALTER TABLE `providers` ADD `userinfo_url` text;--> statement-breakpoint
ALTER TABLE `providers` ADD `token_auth_method` text DEFAULT 'post' NOT NULL;