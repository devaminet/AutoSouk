// Runs before every test file, before dotenv: tests assert the English
// messages, while the API defaults to French.
process.env.DEFAULT_LOCALE = "en";

// The Redis in docker-compose-test.yml, apart from the development one.
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6378";
