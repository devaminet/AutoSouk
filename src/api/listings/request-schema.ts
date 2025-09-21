import { z } from "zod";

export const createListingSchema = z.object(
  {
    title: z.string({
      required_error: "Title is required",
      invalid_type_error: "Title must be a text",
    }),
    description: z.string({
      required_error: "Description is required",
      invalid_type_error: "Description must be a text",
    }),
  },
  { required_error: "Body with title and description is required" }
);
