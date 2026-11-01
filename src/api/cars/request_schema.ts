import { z } from "zod";
import { messageKey } from "../../i18n/zod_issues";
import { allowedFileTypes, getFileType } from "../../utils/functions";

export const createCarSchema = z.object({
  makeId: z.number(),
  modelId: z.number(),
  carburantId: z.number(),
  originId: z.number(),
  stateId: z.number(),
  price: z.number(),
  year: z.number(),
  ownersCount: z.number(),
  cityId: z.number(),
  distance: z.string(),
  transmission: z.enum(["manual", "automatic"]),
  fiscalPower: z.number(),
  doorsNumber: z.number(),
  filenames: z.array(
    z.string().refine(
      (name) => !!getFileType(name),
      (filename) => ({
        message: messageKey("validation.file_type"),
        params: { filename, allowed: allowedFileTypes },
      }),
    ),
  ),
});
