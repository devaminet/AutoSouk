import { z } from "zod";
import { allowedFileTypes, getFileType } from "../../utils/functions";

export const createCarSchema = z.object(
  {
    makeId: z.number({
      required_error: "Car make is required",
      invalid_type_error: "Car make must be a number",
    }),
    modelId: z.number({
      required_error: "Car model is required",
      invalid_type_error: "Car model must be a number",
    }),
    carburantId: z.number({
      required_error: "Carburant is required",
      invalid_type_error: "Carburant must be a number",
    }),
    originId: z.number({
      required_error: "Origin is required",
      invalid_type_error: "Origin must be a number",
    }),
    stateId: z.number({
      required_error: "State is required",
      invalid_type_error: "State must be a number",
    }),
    price: z.number({
      required_error: "Price is required",
      invalid_type_error: "Price must be a number",
    }),
    year: z.number({
      required_error: "Year is required",
      invalid_type_error: "Year must be a number",
    }),
    ownersCount: z.number({
      required_error: "Owners count is required",
      invalid_type_error: "Owners count must be a number",
    }),
    city: z.string({
      required_error: "City is required",
      invalid_type_error: "City must be a text",
    }),
    distance: z.string({
      required_error: "Distance is required",
      invalid_type_error: "Distance must be a text",
    }),
    transmission: z.enum(["manual", "automatic"], {
      message: "Transmission should be either manual or automatic",
    }),
    fiscalPower: z.number({
      required_error: "Fiscal power is required",
      invalid_type_error: "Fiscal power must be a number",
    }),
    doorsNumber: z.number({
      required_error: "Doors number is required",
      invalid_type_error: "Doors number must be a number",
    }),
    filenames: z.array(
      z.string().refine(
        (name) => {
          const isValid = getFileType(name);
          return !!isValid;
        },
        (filename) => {
          return {
            message: `${filename} has an invalid file type, allowed type: ${allowedFileTypes}`,
          };
        }
      )
    ),
  },
  {
    required_error: "Car details are required",
  }
);
