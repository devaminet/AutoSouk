import { CustomError } from "./custom-error";

export class NotAllowedError extends CustomError {
  statusCode = 403;
  constructor(message?: string) {
    super(message || "Forbidden");
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
