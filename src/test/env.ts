// Runs before every test file, before dotenv: tests assert the English
// messages, while the API defaults to French.
process.env.DEFAULT_LOCALE = "en";
