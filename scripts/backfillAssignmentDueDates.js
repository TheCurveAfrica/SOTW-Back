// Corrects assignment due dates that were stored against the server's clock
// instead of the cohort's.
//
// createAssignment used to combine the tutor's "YYYY-MM-DD" + "HH:MM" with
// `new Date(y, m - 1, d, h, min)`, which reads the parts in the *host* zone.
// Production runs on Vercel at TZ=UTC while the cohort runs Africa/Lagos
// (UTC+1), so a task typed as 2:00 AM was stored as 02:00Z and actually closed
// at 3:00 AM WAT - the accidental "one hour grace period".
//
// The correction reinterprets each stored instant: decompose it in UTC to
// recover the wall clock the tutor typed (that is exactly what the old
// formatDueDate printed back to them), then re-read those same parts in
// Africa/Lagos. For WAT this is a flat -1h, but expressing it as a
// reinterpretation documents itself and survives any future offset change.
//
// After this runs, formattedDueDate for every task should read exactly as it
// did before - that is the check that the backfill and the new formatter agree.
//
// THIS CORRECTION IS NOT IDEMPOTENT: it shifts every row it touches, so running
// it twice would move deadlines back two hours. Two guards prevent that:
//   1. A marker in the `migrations` collection; a second --confirm run aborts.
//   2. --before, which restricts the sweep to rows last written by the old code.
// Pass --before with the time you deployed the timezone fix. Anything created or
// edited after that was already stored correctly and must not be shifted.
//
// CAVEAT: an assignment created on a developer machine already running WAT was
// also stored correctly. Everything written through production went via UTC.
// Review the dry-run list and exclude any such ids with --skip.
//
// Usage:
//   node scripts/backfillAssignmentDueDates.js                          (dry run: lists changes, writes nothing)
//   node scripts/backfillAssignmentDueDates.js --before=2026-09-04T12:00:00Z
//   node scripts/backfillAssignmentDueDates.js --before=... --confirm   (applies the changes)
//   node scripts/backfillAssignmentDueDates.js --skip=id1,id2           (leaves those assignments untouched)

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../config/index.env") });
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const Assignment = require("../models/Assignment");
const { COHORT_TIMEZONE, formatCohortDateTime } = require("../utils/cohortTime");

const MIGRATION_KEY = "assignmentDueDateTimezone";

const CONFIRM = process.argv.includes("--confirm");
const FORCE = process.argv.includes("--force");

const argValue = (name) =>
  (process.argv.find((arg) => arg.startsWith(`${name}=`)) || "").split("=").slice(1).join("=");

const SKIP = new Set(argValue("--skip").split(",").filter(Boolean));
const BEFORE_RAW = argValue("--before");

// Marker collection, defined inline: this is the only thing that reads it.
const Migration = mongoose.model(
  "Migration",
  new mongoose.Schema({ key: { type: String, unique: true }, appliedAt: Date, count: Number }),
  "migrations"
);

// The wall clock the tutor typed, re-read in the cohort's zone.
const correctedDueDateTime = (stored) => {
  const asTyped = moment.utc(stored).format("YYYY-MM-DD HH:mm");
  return moment.tz(asTyped, "YYYY-MM-DD HH:mm", true, COHORT_TIMEZONE).toDate();
};

async function main() {
  let before = null;
  if (BEFORE_RAW) {
    before = new Date(BEFORE_RAW);
    if (Number.isNaN(before.getTime())) {
      console.error(`--before is not a valid date: "${BEFORE_RAW}"`);
      process.exitCode = 1;
      return;
    }
  }

  await mongoose.connect(process.env.URL);

  const applied = await Migration.findOne({ key: MIGRATION_KEY });
  if (applied && CONFIRM && !FORCE) {
    console.error(
      `Already applied on ${applied.appliedAt.toISOString()} (${applied.count} assignment(s)).\n` +
        "Re-running would shift deadlines another hour. Pass --force only if you are certain."
    );
    process.exitCode = 1;
    return;
  }
  if (applied) {
    console.log(`NOTE: already applied on ${applied.appliedAt.toISOString()} (${applied.count} assignment(s)).\n`);
  }

  const filter = { dueDateTime: { $ne: null } };
  if (before) filter.updatedAt = { $lt: before };

  const assignments = await Assignment.find(filter, "title week dueDateTime updatedAt").sort({
    dueDateTime: 1
  });

  const changes = assignments
    .filter((assignment) => !SKIP.has(String(assignment._id)))
    .map((assignment) => ({ assignment, corrected: correctedDueDateTime(assignment.dueDateTime) }))
    .filter(({ assignment, corrected }) => assignment.dueDateTime.getTime() !== corrected.getTime());

  if (!before) {
    console.log(
      "WARNING: no --before given, so every assignment is in scope - including any\n" +
        "already written correctly by the fixed code. Pass --before=<deploy time>.\n"
    );
  }

  if (changes.length === 0) {
    console.log(`Checked ${assignments.length} assignment(s). Nothing to correct.`);
    return;
  }

  console.log(`Checked ${assignments.length} assignment(s); ${changes.length} to correct:\n`);
  changes.forEach(({ assignment, corrected }) => {
    console.log(`  ${assignment._id}  wk${assignment.week} ${assignment.title}`);
    console.log(
      `    stored   ${assignment.dueDateTime.toISOString()}  (${formatCohortDateTime(assignment.dueDateTime)} WAT)`
    );
    console.log(`    becomes  ${corrected.toISOString()}  (${formatCohortDateTime(corrected)} WAT)`);
  });

  if (SKIP.size > 0) console.log(`\n${SKIP.size} assignment(s) excluded by --skip.`);

  if (!CONFIRM) {
    console.log("\nDry run only, nothing written. Re-run with --confirm to apply.");
    return;
  }

  const result = await Assignment.bulkWrite(
    changes.map(({ assignment, corrected }) => ({
      updateOne: {
        filter: { _id: assignment._id },
        // timestamps:false so updatedAt keeps pointing at the last real edit,
        // which is what a re-run's --before cutoff reasons about.
        update: { $set: { dueDateTime: corrected } },
        timestamps: false
      }
    }))
  );

  await Migration.updateOne(
    { key: MIGRATION_KEY },
    { $set: { appliedAt: new Date(), count: result.modifiedCount } },
    { upsert: true }
  );

  console.log(`\nUpdated ${result.modifiedCount} assignment(s).`);
}

main()
  .catch((err) => {
    console.error("Error while backfilling assignment due dates:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
