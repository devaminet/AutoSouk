import type { sourceResources } from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "errors";
    resources: typeof sourceResources;
  }
}
