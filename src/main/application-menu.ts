import type { MenuItemConstructorOptions } from "electron";

export interface ApplicationMenuOptions {
  readonly appName: string;
  readonly onOpenSettings: () => void;
  readonly platform?: NodeJS.Platform;
}

export function createApplicationMenuTemplate({
  appName,
  onOpenSettings,
  platform = process.platform,
}: ApplicationMenuOptions): MenuItemConstructorOptions[] {
  const settingsItem: MenuItemConstructorOptions = {
    accelerator: "CmdOrCtrl+,",
    click: onOpenSettings,
    label: "Settings…",
  };
  const standardMenus: MenuItemConstructorOptions[] = [
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];

  if (platform !== "darwin") {
    return [
      {
        label: "File",
        submenu: [
          settingsItem,
          { type: "separator" },
          { role: "quit" },
        ],
      },
      ...standardMenus,
    ];
  }

  return [
    {
      label: appName,
      submenu: [
        { role: "about" },
        { type: "separator" },
        settingsItem,
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "fileMenu" },
    ...standardMenus,
  ];
}
