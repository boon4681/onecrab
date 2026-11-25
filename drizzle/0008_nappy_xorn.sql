ALTER TABLE `providers` ADD `scopes` text;--> statement-breakpoint
ALTER TABLE `providers` ADD `use_pkce` integer DEFAULT true NOT NULL;