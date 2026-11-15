import { SmsMessage, SmsProvider, SmsReceipt } from "../types";

// Writes texts to the server log instead of sending them. For development
// and tests only: the registry refuses it in production.
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";

  async send({ to, body }: SmsMessage): Promise<SmsReceipt> {
    console.info(`[sms] to ${to}: ${body}`);
    return { provider: this.name, messageId: null };
  }
}
