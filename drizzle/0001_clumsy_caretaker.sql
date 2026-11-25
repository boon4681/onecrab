CREATE TABLE `shares` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`size` integer NOT NULL,
	`salt` blob NOT NULL,
	`file_iv` blob NOT NULL,
	`sealed_meta` blob NOT NULL,
	`expires_at` integer NOT NULL,
	`max_downloads` integer,
	`downloads` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
