import { createSmsServiceFromEnv } from "../sms/config";
import { SmsService } from "../sms/service";

let service: SmsService | null = null;

// Sends a text through the providers set in SMS_PROVIDERS.
// Builds the service now, so the server stops at start when the SMS
// settings are wrong. Returns the providers it will use, in order.
export const configureSms = () => {
  service = createSmsServiceFromEnv();
  return service.providerNames;
};

export const sendSms = async (to: string, body: string) => {
  service ??= createSmsServiceFromEnv();
  return service.send(to, body);
};
