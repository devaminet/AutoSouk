import { CustomError } from "./custom_error";

export class NotAuthorizedError extends CustomError {
  statusCode = 401;
  constructor(error?: string) {
    super(error || "Not Authorized");
  }
  serializeError() {
    return [{ message: this.message }];
  }
}
