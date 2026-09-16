import express from "express";
import cookieSession from "cookie-session";
import swaggerUi from "swagger-ui-express";
import router from "./routes";
import errorHandler from "./middlewares/error_handler";
import { NotFoundError } from "./errors/not_found_error";
import currentUser from "./middlewares/current_user";
import { swaggerSpec } from "./swagger";

export const app = express();

app.disable("x-powered-by");
app.use(express.json());
if (process.env.NODE_ENV === "development") {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
app.use(
  cookieSession({
    secret: process.env.COOKIE_SECRET,
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "lax" : "none",
    secure: process.env.NODE_ENV === "production",
  }),
);
app.use(currentUser);
app.use(router);

// catch all non existante routes and send 404
app.all("/{*splat}", () => {
  throw new NotFoundError();
});

app.use(errorHandler);
