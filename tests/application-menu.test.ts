import { describe, expect, it, vi } from "vitest";

import { createApplicationMenuTemplate } from "../src/main/application-menu";

describe("application settings menu", () => {
  it("places Settings in the macOS app menu with Cmd+,", () => {
    const onOpenSettings = vi.fn();
    const [appMenu] = createApplicationMenuTemplate({
      appName: "Locomo Music",
      onOpenSettings,
      platform: "darwin",
    });

    expect(appMenu?.label).toBe("Locomo Music");
    expect(Array.isArray(appMenu?.submenu)).toBe(true);
    const settingsItem = Array.isArray(appMenu?.submenu)
      ? appMenu.submenu.find((item) => item.label === "Settings…")
      : undefined;

    expect(settingsItem?.accelerator).toBe("CmdOrCtrl+,");
    expect(settingsItem?.click).toBe(onOpenSettings);
  });
});
