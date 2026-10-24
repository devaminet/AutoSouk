import { CustomError } from "./custom_error";

export class ServiceUnavailableError extends CustomError {
  statusCode = 503;
  constructor(public message: string) {
    super(message);
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
