import { CustomError } from "./custom_error";

export class BadRequestError extends CustomError {
  statusCode = 400;
  constructor(public message: string) {
    super(message);
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
