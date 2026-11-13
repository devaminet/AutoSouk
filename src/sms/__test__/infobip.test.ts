import { SmsProviderError } from "../errors";
import { InfobipSmsProvider } from "../providers/infobip";

const reply = (status: number, body: unknown) =>
  jest.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );

const provider = (fetch: jest.Mock) =>
  new InfobipSmsProvider({ baseUrl: "abc123.api.infobip.com/", apiKey: "secret", sender: "AutoSouk", fetch });

it("sends the text with the API key and the sender name", async () => {
  const fetch = reply(200, {
    bulkId: "b1",
    messages: [{ messageId: "m1", status: { groupName: "PENDING", name: "PENDING_ACCEPTED" } }],
  });

  const receipt = await provider(fetch).send({ to: "+212612345678", body: "Your code is 123456" });

  expect(receipt).toEqual({ provider: "infobip", messageId: "m1" });
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("https://abc123.api.infobip.com/sms/2/text/advanced");
  expect(init.method).toBe("POST");
  expect(init.headers).toMatchObject({ Authorization: "App secret", "Content-Type": "application/json" });
  expect(JSON.parse(init.body)).toEqual({
    messages: [{ destinations: [{ to: "212612345678" }], from: "AutoSouk", text: "Your code is 123456" }],
  });
});

it("reports the API's reason when it refuses the request", async () => {
  const fetch = reply(401, { requestError: { serviceException: { messageId: "UNAUTHORIZED", text: "Invalid login details" } } });

  const error = await provider(fetch).send({ to: "+212612345678", body: "hi" }).catch((e) => e);

  expect(error).toBeInstanceOf(SmsProviderError);
  expect(error).toMatchObject({ provider: "infobip", status: 401, message: "infobip: Invalid login details" });
});

it("fails when the message itself is rejected", async () => {
  const fetch = reply(200, {
    messages: [{ messageId: "m2", status: { groupName: "REJECTED", description: "Destination not registered" } }],
  });

  await expect(provider(fetch).send({ to: "+212612345678", body: "hi" })).rejects.toThrow(
    "infobip: Destination not registered",
  );
});

it("fails when Infobip can't be reached", async () => {
  const fetch = jest.fn().mockRejectedValue(new TypeError("fetch failed"));

  await expect(provider(fetch).send({ to: "+212612345678", body: "hi" })).rejects.toThrow(
    "infobip: request failed (fetch failed)",
  );
});
