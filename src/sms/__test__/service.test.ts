import { SmsDeliveryError, SmsProviderError, SmsRecipientError } from "../errors";
import { SmsService } from "../service";
import { SmsMessage, SmsProvider } from "../types";

// A provider that records what it sends, or fails.
const fakeProvider = (name: string, fails = false) => {
  const sent: SmsMessage[] = [];
  const provider: SmsProvider = {
    name,
    send: async (message) => {
      if (fails) {
        throw new SmsProviderError(name, "down");
      }
      sent.push(message);
      return { provider: name, messageId: `${name}-1` };
    },
  };
  return { provider, sent };
};

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

it("sends through the first provider, with the number in E.164", async () => {
  const first = fakeProvider("first");
  const second = fakeProvider("second");
  const service = new SmsService([first.provider, second.provider]);

  const receipt = await service.send("06 12 34 56 78", "hello");

  expect(receipt).toEqual({ provider: "first", messageId: "first-1" });
  expect(first.sent).toEqual([{ to: "+212612345678", body: "hello" }]);
  expect(second.sent).toEqual([]);
});

it("falls back to the next provider when one fails", async () => {
  const broken = fakeProvider("broken", true);
  const backup = fakeProvider("backup");
  const service = new SmsService([broken.provider, backup.provider]);

  const receipt = await service.send("+212612345678", "hello");

  expect(receipt.provider).toBe("backup");
});

it("reports every failure when no provider delivers", async () => {
  const service = new SmsService([fakeProvider("a", true).provider, fakeProvider("b", true).provider]);

  const error = await service.send("+212612345678", "hello").catch((e) => e);

  expect(error).toBeInstanceOf(SmsDeliveryError);
  expect(error.failures.map((failure: SmsProviderError) => failure.provider)).toEqual(["a", "b"]);
});

it("texts only the allowed countries", async () => {
  const provider = fakeProvider("only");
  const service = new SmsService([provider.provider], { allowedCountryCodes: ["212"] });

  await expect(service.send("+33612345678", "hello")).rejects.toBeInstanceOf(SmsRecipientError);
  await expect(service.send("not a number", "hello")).rejects.toBeInstanceOf(SmsRecipientError);
  expect(provider.sent).toEqual([]);
});
