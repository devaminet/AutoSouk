import { CustomError } from "./custom_error";

export class PreconditionFailedError extends CustomError {
  statusCode = 412;
  constructor(public message: string) {
    super(message);
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
