import { insertMissingSettingDefaults } from "../../api/settings/db";
import { settingDefinitions, settingKeys } from "../../settings/definitions";

// Stores every setting's code default in app_settings so the table lists all
// settings. Existing rows are never overwritten, so admin changes survive.
// A default changed in code later only applies to settings without a row.
export const generateAppSettingsData = async () => {
  await insertMissingSettingDefaults(
    settingKeys.map((key) => ({
      key,
      value: settingDefinitions[key].defaultValue,
    })),
  );
};
