import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../app";
import { db } from "../../db";
import { usersTable } from "../../db/schema/user";
import { signupUser, testUserCredentials } from "../../test/helpers";
import { readTemplateFile, sendMail } from "../../utils/functions";
import { emailTemplateContext } from "../emails";
import { Locale } from "..";

// The test setup mocks readTemplateFile; render the real templates here.
const { readTemplateFile: renderTemplate } = jest.requireActual<
  typeof import("../../utils/functions")
>("../../utils/functions");

const leftoverKey = /\b(common|register|forgot_password)\.[a-z_]+/;

describe("email templates", () => {
  it.each<[string, Locale, string, string]>([
    ["register.ejs", "en", "ltr", "Verify Email Address"],
    ["register.ejs", "fr", "ltr", "Vérifier mon adresse e-mail"],
    ["register.ejs", "ar", "rtl", "تحقق من البريد الإلكتروني"],
    ["forgot_password.ejs", "en", "ltr", "Reset My Password"],
    ["forgot_password.ejs", "fr", "ltr", "Réinitialiser mon mot de passe"],
    ["forgot_password.ejs", "ar", "rtl", "إعادة تعيين كلمة المرور"],
  ])("renders %s in %s", async (template, locale, dir, button) => {
    const html = await renderTemplate(template, {
      ...emailTemplateContext(locale),
      firstName: "Amina",
      verificationUrl: "https://autosouk.ma/verify",
      forgotPasswordUrl: "https://autosouk.ma/reset",
      expirationMinutes: 5,
    });

    expect(html).toContain(`<html lang="${locale}" dir="${dir}">`);
    expect(html).toContain(button);
    expect(html).toContain("Amina");
    expect(html).not.toMatch(leftoverKey);
  });

  it("uses the plural expiry in the verification email", async () => {
    const html = await renderTemplate("register.ejs", {
      ...emailTemplateContext("ar"),
      firstName: "Amina",
      verificationUrl: "https://autosouk.ma/verify",
      expirationMinutes: 5,
    });

    expect(html).toContain("خلال 5 دقائق");
  });

  it("escapes values put into translated text", async () => {
    const html = await renderTemplate("register.ejs", {
      ...emailTemplateContext("en"),
      firstName: "<script>alert(1)</script>",
      verificationUrl: "https://autosouk.ma/verify",
      expirationMinutes: 5,
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("Hi &lt;script&gt;");
  });
});

describe("user locale", () => {
  const savedLocale = async (email: string) => {
    const [user] = await db
      .select({ locale: usersTable.locale })
      .from(usersTable)
      .where(eq(usersTable.email, email));
    return user.locale;
  };

  it("defaults to French for users created without one", async () => {
    expect(await savedLocale("admin@autosouk.com")).toBe("fr");
  });

  it("saves the request locale at signup and sends the email in it", async () => {
    await request(app)
      .post("/api/auth/register?lang=ar")
      .send({
        firstName: "Amina",
        lastName: "Alaoui",
        email: testUserCredentials.email,
        password: testUserCredentials.password,
        phone: "+212600000000",
        userType: "buyer",
        cityId: 1,
      })
      .expect(201);

    expect(await savedLocale(testUserCredentials.email)).toBe("ar");
    expect((readTemplateFile as jest.Mock).mock.calls[0][1].locale).toBe("ar");
    expect((sendMail as jest.Mock).mock.calls[0][0].subject).toBe(
      "تفعيل الحساب",
    );
  });

  it("emails in the saved locale, not the request's", async () => {
    await signupUser();
    await db
      .update(usersTable)
      .set({ locale: "fr" })
      .where(eq(usersTable.email, testUserCredentials.email));

    await request(app)
      .post("/api/auth/forgot-password")
      .set("Accept-Language", "ar")
      .send({ email: testUserCredentials.email })
      .expect(200);

    const mail = (sendMail as jest.Mock).mock.calls.at(-1)[0];
    expect(mail.subject).toBe(
      "Demande de réinitialisation du mot de passe de votre compte",
    );
  });
});
