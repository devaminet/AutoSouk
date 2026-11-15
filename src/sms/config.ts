import { SmsConfigError } from "./errors";
import { smsProviderFactories } from "./providers";
import { SmsService } from "./service";

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

// Builds the SMS service the environment asks for:
// - SMS_PROVIDERS: providers to try in order, such as "infobip,twilio".
//   Defaults to "console" outside production, where it must be set.
// - SMS_ALLOWED_COUNTRY_CODES: such as "212". Defaults to Morocco.
export const createSmsServiceFromEnv = (env: NodeJS.ProcessEnv = process.env) => {
  const isProduction = env.NODE_ENV === "production";
  const names = list(env.SMS_PROVIDERS);
  if (names.length === 0) {
    if (isProduction) {
      throw new SmsConfigError("SMS_PROVIDERS must be set in production");
    }
    names.push("console");
  }
  if (isProduction && names.includes("console")) {
    throw new SmsConfigError("The console SMS provider can't be used in production");
  }

  const providers = names.map((name) => {
    const factory = smsProviderFactories[name];
    if (!factory) {
      const known = Object.keys(smsProviderFactories).join(", ");
      throw new SmsConfigError(`Unknown SMS provider "${name}". Known: ${known}`);
    }
    return factory(env);
  });

  const countries = env.SMS_ALLOWED_COUNTRY_CODES === undefined ? ["212"] : list(env.SMS_ALLOWED_COUNTRY_CODES);
  return new SmsService(providers, { allowedCountryCodes: countries });
};
