import { CustomError } from "./custom_error";

export class NotFoundError extends CustomError {
  statusCode = 404;
  constructor(error?: string) {
    super(error || "Not found");
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
