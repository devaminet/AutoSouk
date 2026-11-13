import { createSmsServiceFromEnv } from "../config";
import { SmsConfigError } from "../errors";

const infobip = {
  INFOBIP_BASE_URL: "abc123.api.infobip.com",
  INFOBIP_API_KEY: "secret",
  INFOBIP_SENDER: "AutoSouk",
};

it("logs texts to the console by default outside production", () => {
  expect(createSmsServiceFromEnv({ NODE_ENV: "development" }).providerNames).toEqual(["console"]);
});

it("uses the providers named, in order", () => {
  const service = createSmsServiceFromEnv({ SMS_PROVIDERS: "Infobip, console", ...infobip });
  expect(service.providerNames).toEqual(["infobip", "console"]);
});

it("names the setting a provider is missing", () => {
  expect(() => createSmsServiceFromEnv({ SMS_PROVIDERS: "infobip", INFOBIP_BASE_URL: "x" })).toThrow(
    "INFOBIP_API_KEY is required for this SMS provider",
  );
});

it("lists the known providers when one is unknown", () => {
  expect(() => createSmsServiceFromEnv({ SMS_PROVIDERS: "carrier-pigeon" })).toThrow(
    'Unknown SMS provider "carrier-pigeon". Known: console, infobip',
  );
});

it("needs a real provider in production", () => {
  expect(() => createSmsServiceFromEnv({ NODE_ENV: "production" })).toThrow(SmsConfigError);
  expect(() => createSmsServiceFromEnv({ NODE_ENV: "production", SMS_PROVIDERS: "console" })).toThrow(
    "The console SMS provider can't be used in production",
  );
  expect(createSmsServiceFromEnv({ NODE_ENV: "production", SMS_PROVIDERS: "infobip", ...infobip }).providerNames).toEqual([
    "infobip",
  ]);
});
