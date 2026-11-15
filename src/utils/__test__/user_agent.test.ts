import { deviceLabel } from "../user_agent";

it("names common browsers and systems", () => {
  expect(
    deviceLabel(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    ),
  ).toBe("Chrome on Windows");
  expect(
    deviceLabel(
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0",
    ),
  ).toBe("Edge on Windows");
  expect(
    deviceLabel(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    ),
  ).toBe("Safari on iOS");
  expect(
    deviceLabel(
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
    ),
  ).toBe("Chrome on Android");
  expect(
    deviceLabel(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0",
    ),
  ).toBe("Firefox on macOS");
});

it("falls back when it doesn't know the agent", () => {
  expect(deviceLabel(undefined)).toBe("Unknown device");
  expect(deviceLabel("curl/8.0")).toBe("Unknown device");
});
