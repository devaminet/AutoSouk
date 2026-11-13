export const carBucketName = "cars";
export const mechanicsBucketName = "mechanics";
export const usersBucketName = "users";
export const maxProfileImageSizeBytes = 10 * 1024 * 1024;
export const profileImageUploadExpirationSeconds = 5 * 60;
export const maxCarImageSizeBytes = 10 * 1024 * 1024;
export const maxCarVideoSizeBytes = 50 * 1024 * 1024;
export const carMediaUploadExpirationSeconds = 15 * 60;
export const maxMechanicImageSizeBytes = 10 * 1024 * 1024;
export const mechanicImageUploadExpirationSeconds = 15 * 60;
export const maxGarageImageCount = 12;
export const defaultProfileImageName = "default-avatar.svg";
export const inspectionReportsBucketName = "inspection-reports";
export const tokenExpirationMinutes = 5;
export const maxCarEquipmentCount = 100;
export const minCarImageCount = 3;
export const maxCarMediaCount = 20;
export const supportedLocales = ["en", "fr", "ar"] as const;
export const defaultLocale = "fr";
export const sourceLocale = "en";
export const rtlLocales: readonly string[] = ["ar"];
export const identityBucketName = "identity";
export const maxIdentityVideoSizeBytes = 30 * 1024 * 1024;
export const identityUploadExpirationSeconds = 10 * 60;
export const identityVideoLinkExpirationSeconds = 10 * 60;
export const maxIdentityAttempts = 3;
export const identityChallenges = [
  "turn_left",
  "turn_right",
  "look_up",
  "look_down",
  "smile",
  "blink",
] as const;
export const identityVideoTypes = ["video/webm", "video/mp4"] as const;
export const phoneCodeLength = 6;
export const phoneCodeExpirationMinutes = 10;
export const phoneCodeResendSeconds = 60;
export const maxPhoneCodesPerHour = 5;
export const maxPhoneCodeAttempts = 3;
