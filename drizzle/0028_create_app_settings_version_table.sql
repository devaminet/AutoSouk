CREATE TABLE "app_settings_version" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" bigint NOT NULL,
	CONSTRAINT "app_settings_version_single_row" CHECK ("app_settings_version"."id" = 1)
);
