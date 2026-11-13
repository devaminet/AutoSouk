// A provider refused the message or couldn't be reached.
export class SmsProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
  ) {
    super(`${provider}: ${message}`);
    this.name = "SmsProviderError";
  }
}

// Every provider failed. Holds each provider's error, in the order tried.
export class SmsDeliveryError extends Error {
  constructor(readonly failures: SmsProviderError[]) {
    super(
      `No SMS provider delivered the message: ${failures.map(({ message }) => message).join("; ")}`,
    );
    this.name = "SmsDeliveryError";
  }
}

// The number isn't one AutoSouk texts, such as a foreign or malformed one.
export class SmsRecipientError extends Error {
  constructor(readonly phone: string) {
    super(`Can't text this number: ${phone}`);
    this.name = "SmsRecipientError";
  }
}

// The SMS settings in the environment are wrong or missing.
export class SmsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsConfigError";
  }
}
