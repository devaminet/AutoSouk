// A short, readable name for the browser and system in a User-Agent header,
// such as "Chrome on Windows", for the list of signed-in devices.
const browsers: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/Firefox\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const systems: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

const first = (list: [RegExp, string][], text: string) =>
  list.find(([pattern]) => pattern.test(text))?.[1] ?? null;

export const deviceLabel = (userAgent: string | undefined): string => {
  const text = userAgent ?? "";
  const browser = first(browsers, text);
  const system = first(systems, text);
  if (browser && system) {
    return `${browser} on ${system}`;
  }
  return browser ?? system ?? "Unknown device";
};
