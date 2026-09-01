// Recomputes punctualityScore on existing attendance records from their stored
// check-in time, correcting two historical bugs:
//   1. The old scoring bands left a gap at 09:45:01-09:45:59, so anyone checking
//      in during that minute was scored 0 as if they had never shown up.
//   2. The score used to be derived from the server's local clock while the
//      stored time was WAT, so the two disagreed on any non-UTC host.
//
// Usage:
//   node scripts/backfillPunctualityScores.js            (dry run: lists changes, writes nothing)
//   node scripts/backfillPunctualityScores.js --confirm  (applies the changes)

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../config/index.env") });
const mongoose = require("mongoose");
const dataModel = require("../models/dataModel");
const { punctualityScoreFor } = require("../utils/attendance");

const CONFIRM = process.argv.includes("--confirm");

async function main() {
  await mongoose.connect(process.env.URL);

  const records = await dataModel.find(
    { time: { $type: "string" } },
    "date time punctualityScore"
  );

  const changes = records
    .map((record) => ({ record, score: punctualityScoreFor(record.time) }))
    .filter(({ record, score }) => record.punctualityScore !== score);

  if (changes.length === 0) {
    console.log(`Checked ${records.length} record(s). All scores already correct.`);
    return;
  }

  console.log(`Checked ${records.length} record(s); ${changes.length} need correcting:`);
  changes.forEach(({ record, score }) => {
    console.log(`  ${record._id}  ${record.date} ${record.time}  ${record.punctualityScore} -> ${score}`);
  });

  if (!CONFIRM) {
    console.log("\nDry run only, nothing written. Re-run with --confirm to apply.");
    return;
  }

  const result = await dataModel.bulkWrite(
    changes.map(({ record, score }) => ({
      updateOne: {
        filter: { _id: record._id },
        update: { $set: { punctualityScore: score } }
      }
    }))
  );

  console.log(`\nUpdated ${result.modifiedCount} record(s).`);
}

main()
  .catch((err) => {
    console.error("Error while backfilling punctuality scores:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
