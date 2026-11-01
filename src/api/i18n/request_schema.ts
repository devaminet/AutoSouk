import { z } from "zod";
import { localeSchema } from "../../i18n";
import { clientNamespaces } from "../../i18n/resources";

export const catalogParamsSchema = z.object({
  locale: localeSchema,
  namespace: z.enum(clientNamespaces),
});
