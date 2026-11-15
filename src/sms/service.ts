import { SmsDeliveryError, SmsProviderError, SmsRecipientError } from "./errors";
import { toE164 } from "./phone";
import { SmsProvider, SmsReceipt } from "./types";

export type SmsServiceOptions = {
  // Country codes AutoSouk texts, without "+". Empty means any country.
  // Limiting them blocks texts to costly foreign numbers sent by bots.
  allowedCountryCodes?: string[];
};

// Sends texts through the providers it's given, in order: when one fails,
// the next one tries. It only knows the SmsProvider interface, so changing
// or adding a provider never changes this class.
export class SmsService {
  constructor(
    private readonly providers: SmsProvider[],
    private readonly options: SmsServiceOptions = {},
  ) {
    if (providers.length === 0) {
      throw new Error("SmsService needs at least one provider");
    }
  }

  get providerNames(): string[] {
    return this.providers.map(({ name }) => name);
  }

  async send(phone: string, body: string): Promise<SmsReceipt> {
    const to = toE164(phone);
    const allowed = this.options.allowedCountryCodes ?? [];
    if (!to || (allowed.length > 0 && !allowed.some((code) => to.startsWith(`+${code}`)))) {
      throw new SmsRecipientError(phone);
    }

    const failures: SmsProviderError[] = [];
    for (const provider of this.providers) {
      try {
        return await provider.send({ to, body });
      } catch (error) {
        const failure =
          error instanceof SmsProviderError
            ? error
            : new SmsProviderError(provider.name, (error as Error).message);
        console.error("SMS provider failed:", failure.message);
        failures.push(failure);
      }
    }
    throw new SmsDeliveryError(failures);
  }
}
