import { ZodIssue } from "zod";
import { CustomError } from "./custom_error";

export class RequestValidationError extends CustomError {
  statusCode = 400;
  constructor(private errors: ZodIssue[]) {
    super("Request validation error");
  }

  serializeError(): { message: string; field?: string }[] {
    return this.errors.map((error) => ({
      message: error.message,
      field: error.path[0] as string,
    }));
  }
}
