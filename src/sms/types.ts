// A text message, ready to send. `to` is in E.164 format, such as
// "+212612345678".
export type SmsMessage = {
  to: string;
  body: string;
};

// What a provider says once it accepted a message.
export type SmsReceipt = {
  provider: string;
  // The provider's id for the message, to match delivery reports.
  messageId: string | null;
};

// The strategy: one way to send a text. Each provider (Infobip, Twilio, a
// local gateway...) implements it, and nothing else in the app knows which
// one is used. Throw an SmsProviderError when the message isn't accepted.
export interface SmsProvider {
  // The name used in SMS_PROVIDERS, such as "infobip".
  readonly name: string;
  send(message: SmsMessage): Promise<SmsReceipt>;
}

// Builds a provider from the environment. Throws an SmsConfigError when a
// setting it needs is missing.
export type SmsProviderFactory = (env: NodeJS.ProcessEnv) => SmsProvider;
