// Turns a phone number as users type it into E.164, such as
// "+212612345678". Moroccan numbers may be written the local way, with a
// leading 0. Returns null when it isn't a phone number.
export const toE164 = (phone: string, defaultCountryCode = "212"): string | null => {
  const compact = phone.replace(/[\s().-]/g, "");
  let digits: string;
  if (compact.startsWith("+")) {
    digits = compact.slice(1);
  } else if (compact.startsWith("00")) {
    digits = compact.slice(2);
  } else if (compact.startsWith("0")) {
    digits = defaultCountryCode + compact.slice(1);
  } else {
    digits = compact;
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
};
