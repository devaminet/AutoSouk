import { CustomError } from "./custom-error";

export class InternalServerError extends CustomError {
  statusCode = 500;

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message || "Internal server error" }];
  }
}
