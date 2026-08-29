// Deletes all Registration documents with learningMode: "physical".
//
// Usage:
//   node scripts/deletePhysicalRegistrations.js            (dry run: lists matches, deletes nothing)
//   node scripts/deletePhysicalRegistrations.js --confirm  (actually deletes the matches)
//
// Note: this only removes documents from MongoDB. Any corresponding rows
// already synced to Google Sheets (see utils/sheetClient.js) are untouched.

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../config/index.env") });
const mongoose = require("mongoose");
const Registration = require("../models/Registration");

const CONFIRM = process.argv.includes("--confirm");
const FILTER = { learningMode: "physical" };

async function main() {
  await mongoose.connect(process.env.URL);

  const matches = await Registration.find(FILTER, "email firstName lastName");

  if (matches.length === 0) {
    console.log("No physical registrations found. Nothing to do.");
    return;
  }

  console.log(`Found ${matches.length} physical registration(s):`);
  matches.forEach((r) => {
    console.log(`  - ${r.firstName} ${r.lastName} <${r.email}>`);
  });

  if (!CONFIRM) {
    console.log(
      "\nDry run only, no documents deleted. Re-run with --confirm to delete them."
    );
    return;
  }

  const result = await Registration.deleteMany(FILTER);
  console.log(`\nDeleted ${result.deletedCount} document(s).`);
}

main()
  .catch((err) => {
    console.error("Error while deleting physical registrations:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
