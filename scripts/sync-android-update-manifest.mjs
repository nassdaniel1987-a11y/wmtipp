import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const versionFile = path.join(root, "android-app", "version.properties");
const manifestFile = path.join(root, "public", "app-update.json");

const properties = Object.fromEntries(
  fs.readFileSync(versionFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("=", 2)),
);

const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
manifest.versionCode = Number(properties.VERSION_CODE);
manifest.versionName = properties.VERSION_NAME;

fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`app-update.json auf Version ${manifest.versionName} (${manifest.versionCode}) synchronisiert.`);
