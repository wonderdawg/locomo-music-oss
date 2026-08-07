import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const appPath = path.resolve(
  "release",
  "mac-arm64",
  "Locomo Music OSS.app",
);
const plistPath = path.join(appPath, "Contents", "Info.plist");
const unusedUsageDescriptions = [
  "NSAudioCaptureUsageDescription",
  "NSBluetoothAlwaysUsageDescription",
  "NSBluetoothPeripheralUsageDescription",
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
];

await access(plistPath);
const plist = await readPlist(plistPath);
for (const key of unusedUsageDescriptions) {
  if (Object.hasOwn(plist, key)) {
    await execute("plutil", ["-remove", key, plistPath]);
  }
}
if (Object.hasOwn(plist.NSAppTransportSecurity ?? {}, "NSAllowsArbitraryLoads")) {
  await execute("plutil", [
    "-remove",
    "NSAppTransportSecurity.NSAllowsArbitraryLoads",
    plistPath,
  ]);
}
await execute("plutil", ["-lint", plistPath]);

await execute("codesign", [
  "--force",
  "--deep",
  "--sign",
  "-",
  "--timestamp=none",
  appPath,
]);

console.log(`Applied a local ad-hoc signature to ${appPath}.`);

async function readPlist(file) {
  const { stdout } = await execute("plutil", ["-convert", "json", "-o", "-", file]);
  return JSON.parse(stdout);
}
