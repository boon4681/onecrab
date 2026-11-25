CREATE TABLE `providers` (
	`type` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text NOT NULL,
	`issuer` text,
	`display_name` text,
	`enabled` integer DEFAULT false NOT NULL,
	`last_test_ok` integer,
	`last_test_message` text,
	`last_tested_at` integer,
	`updated_at` integer NOT NULL
);
