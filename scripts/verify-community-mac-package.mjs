import { execFile } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const projectRoot = process.cwd();
const appPath = path.join(
  projectRoot,
  "release",
  "mac-arm64",
  "Locomo Music OSS.app",
);
const resourcesPath = path.join(appPath, "Contents", "Resources");
const licensesPath = path.join(resourcesPath, "licenses");
const forbiddenUsageDescriptions = [
  "NSAudioCaptureUsageDescription",
  "NSBluetoothAlwaysUsageDescription",
  "NSBluetoothPeripheralUsageDescription",
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
];
const forbiddenAtsKeys = [
  "NSAllowsArbitraryLoads",
  "NSAllowsArbitraryLoadsForMedia",
  "NSAllowsArbitraryLoadsInWebContent",
];

await access(appPath);
const infoPlists = await findNamedFiles(appPath, "Info.plist");
for (const plistPath of infoPlists) {
  const plist = await readPlist(plistPath);
  for (const key of forbiddenUsageDescriptions) {
    if (Object.hasOwn(plist, key)) {
      throw new Error(`${path.relative(appPath, plistPath)} declares unused ${key}.`);
    }
  }
  const ats = plist.NSAppTransportSecurity ?? {};
  for (const key of forbiddenAtsKeys) {
    if (Object.hasOwn(ats, key)) {
      throw new Error(`${path.relative(appPath, plistPath)} contains broad ATS key ${key}.`);
    }
  }
}

const mainPlistPath = path.join(appPath, "Contents", "Info.plist");
const mainPlist = await readPlist(mainPlistPath);
if (mainPlist.CFBundleIdentifier !== "com.locomomusic.oss") {
  throw new Error(`Unexpected bundle ID: ${mainPlist.CFBundleIdentifier ?? "missing"}.`);
}
if (mainPlist.LSMinimumSystemVersion !== "15.0") {
  throw new Error(
    `Unexpected minimum macOS version: ${mainPlist.LSMinimumSystemVersion ?? "missing"}.`,
  );
}
const ats = mainPlist.NSAppTransportSecurity ?? {};
if (ats.NSAllowsLocalNetworking !== true) {
  throw new Error("The packaged app is missing its narrow loopback ATS allowance.");
}
const exceptionDomains = Object.keys(ats.NSExceptionDomains ?? {}).sort();
if (exceptionDomains.join(",") !== "127.0.0.1,localhost") {
  throw new Error(`Unexpected ATS exception domains: ${exceptionDomains.join(",") || "none"}.`);
}

await execute("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
const signature = await execute("codesign", ["--display", "--verbose=4", appPath]);
const signatureDetails = `${signature.stdout}\n${signature.stderr}`;
if (!signatureDetails.includes("Signature=adhoc")) {
  throw new Error("The community package does not have an ad-hoc signature.");
}
if (!signatureDetails.includes("Identifier=com.locomomusic.oss")) {
  throw new Error("The signed package has the wrong code-signing identifier.");
}
if (!signatureDetails.includes("TeamIdentifier=not set")) {
  throw new Error("The community package unexpectedly uses a signing team identity.");
}

for (const fileName of [
  "ASSET_LICENSES.md",
  "ASSET_MANIFEST.json",
  "CC0-1.0.txt",
  "Chromium-LICENSES.html",
  "Electron-LICENSE.txt",
  "JS_RUNTIME_LICENSES.txt",
  "Locomo-MIT.txt",
  "THIRD_PARTY_NOTICES.md",
  "TRADEMARKS.md",
]) {
  const packaged = path.join(licensesPath, fileName);
  const metadata = await readFile(packaged);
  if (metadata.byteLength === 0) {
    throw new Error(`Packaged notice is empty: ${fileName}.`);
  }
}

for (const [source, packaged] of [
  ["ASSET_LICENSES.md", "ASSET_LICENSES.md"],
  ["ASSET_MANIFEST.json", "ASSET_MANIFEST.json"],
]) {
  const [sourceBytes, packagedBytes] = await Promise.all([
    readFile(path.join(projectRoot, source)),
    readFile(path.join(licensesPath, packaged)),
  ]);
  if (!sourceBytes.equals(packagedBytes)) {
    throw new Error(`Packaged ${packaged} differs from the public source file.`);
  }
}

console.log(
  `Verified ad-hoc signature, ${infoPlists.length} Info.plists, narrow ATS policy, and packaged notices.`,
);

async function readPlist(file) {
  const { stdout } = await execute("plutil", ["-convert", "json", "-o", "-", file]);
  return JSON.parse(stdout);
}

async function findNamedFiles(directory, name) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findNamedFiles(absolutePath, name)));
    } else if (entry.isFile() && entry.name === name) {
      files.push(absolutePath);
    }
  }
  return files;
}
