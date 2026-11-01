import request from "supertest";
import { app } from "../../app";
import { signupUser, testUserCredentials } from "../../test/helpers";
import { tokenExpirationMinutes } from "../../utils/constants";
import { localizedMessage } from "..";

describe("localizedMessage", () => {
  it("returns the code with the translated message", () => {
    expect(localizedMessage("fr", "auth.password_updated")).toEqual({
      code: "auth.password_updated",
      message: "Votre mot de passe a été mis à jour",
    });
  });

  it("returns the params when there are some", () => {
    expect(
      localizedMessage("en", "auth.password_reset_email_sent", { count: 1 }),
    ).toEqual({
      code: "auth.password_reset_email_sent",
      message:
        "Password reset email sent successfully. The reset link expires in 1 minute",
      params: { count: 1 },
    });
  });
});

describe("success messages over HTTP", () => {
  it("translates a success message", async () => {
    const response = await request(app)
      .post("/api/auth/logout")
      .set("Accept-Language", "ar")
      .expect(200);

    expect(response.body).toEqual({
      code: "auth.logged_out",
      message: "تم تسجيل خروجك",
    });
  });

  it("uses the plural form for the reset link expiry", async () => {
    await signupUser();

    const response = await request(app)
      .post("/api/auth/forgot-password")
      .set("Accept-Language", "ar")
      .send({ email: testUserCredentials.email })
      .expect(200);

    expect(response.body).toEqual({
      code: "auth.password_reset_email_sent",
      message: `تم إرسال رسالة إعادة تعيين كلمة المرور. تنتهي صلاحية الرابط خلال ${tokenExpirationMinutes} دقائق`,
      params: { count: tokenExpirationMinutes },
    });
  });
});
