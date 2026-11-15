import { SmsConfigError } from "../errors";
import { SmsProviderFactory } from "../types";
import { ConsoleSmsProvider } from "./console";
import { InfobipSmsProvider } from "./infobip";

const required = (env: NodeJS.ProcessEnv, name: string) => {
  const value = env[name]?.trim();
  if (!value) {
    throw new SmsConfigError(`${name} is required for this SMS provider`);
  }
  return value;
};

// Every provider the app can use, by the name SMS_PROVIDERS gives it. To add
// one, such as Twilio: write a class that implements SmsProvider in this
// folder, then add its factory here. Nothing else changes.
export const smsProviderFactories: Record<string, SmsProviderFactory> = {
  console: () => new ConsoleSmsProvider(),
  infobip: (env) =>
    new InfobipSmsProvider({
      baseUrl: required(env, "INFOBIP_BASE_URL"),
      apiKey: required(env, "INFOBIP_API_KEY"),
      sender: required(env, "INFOBIP_SENDER"),
    }),
};
