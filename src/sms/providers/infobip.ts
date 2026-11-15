import { SmsProviderError } from "../errors";
import { SmsMessage, SmsProvider, SmsReceipt } from "../types";

export type InfobipSettings = {
  // The account's own base URL, such as "https://xxxxx.api.infobip.com".
  baseUrl: string;
  apiKey: string;
  // The registered sender name, such as "AutoSouk".
  sender: string;
  timeoutMs?: number;
  // Replaceable in tests.
  fetch?: typeof fetch;
};

type InfobipResponse = {
  messages?: {
    messageId?: string;
    status?: { groupName?: string; description?: string };
  }[];
  requestError?: { serviceException?: { text?: string } };
};

// Infobip refuses a message outright with these status groups. Others, such
// as PENDING, mean it was accepted.
const refusedGroups = ["REJECTED", "UNDELIVERABLE", "EXPIRED"];

// Sends texts through Infobip's SMS API (POST /sms/2/text/advanced).
export class InfobipSmsProvider implements SmsProvider {
  readonly name = "infobip";
  private readonly url: string;

  constructor(private readonly settings: InfobipSettings) {
    const base = settings.baseUrl.replace(/\/+$/, "");
    this.url = `${/^https?:\/\//.test(base) ? base : `https://${base}`}/sms/2/text/advanced`;
  }

  async send({ to, body }: SmsMessage): Promise<SmsReceipt> {
    const request = this.settings.fetch ?? fetch;
    let response: Response;
    try {
      response = await request(this.url, {
        method: "POST",
        headers: {
          Authorization: `App ${this.settings.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              // Infobip takes the number without the plus.
              destinations: [{ to: to.replace(/^\+/, "") }],
              from: this.settings.sender,
              text: body,
            },
          ],
        }),
        signal: AbortSignal.timeout(this.settings.timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new SmsProviderError(this.name, `request failed (${(error as Error).message})`);
    }

    const payload = (await response.json().catch(() => ({}))) as InfobipResponse;
    if (!response.ok) {
      const reason =
        payload.requestError?.serviceException?.text ?? response.statusText;
      throw new SmsProviderError(this.name, reason || "request refused", response.status);
    }

    const sent = payload.messages?.[0];
    const group = sent?.status?.groupName ?? "";
    if (!sent || refusedGroups.includes(group)) {
      throw new SmsProviderError(
        this.name,
        sent?.status?.description ?? "message not accepted",
        response.status,
      );
    }
    return { provider: this.name, messageId: sent.messageId ?? null };
  }
}
