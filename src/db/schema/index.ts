import * as cars from "./car";
import * as listings from "./listing";
import * as carMedias from "./car_media";
import * as carOrigins from "./car_origin";
import * as carCarburants from "./carburant";
import * as carMakes from "./car_make";
import * as carModels from "./car_model";
import * as carStates from "./state";
import * as users from "./user";
import * as refreshTokens from "./refresh_tokens";
import * as emailVerificationTokens from "./email_verification_tokens";
import * as forgetPasswordToken from "./forget_password_tokens";
import * as cities from "./city";
import * as roles from "./roles";
import * as mechanics from "./mechanic";
import * as mechanicGarageImages from "./mechanic_garage_image";

export const schema = {
  ...cars,
  ...listings,
  ...carMedias,
  ...carOrigins,
  ...carCarburants,
  ...carMakes,
  ...carModels,
  ...carStates,
  ...users,
  ...refreshTokens,
  ...emailVerificationTokens,
  ...forgetPasswordToken,
  ...cities,
  ...roles,
  ...mechanics,
  ...mechanicGarageImages,
};
