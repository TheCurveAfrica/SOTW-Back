const mongoose = require("mongoose");

// Program-wide settings for the running cohort. Exactly one document exists,
// enforced by the immutable unique `key` — read it through
// utils/programWeek.getProgramSettings(), which upserts it on first access.
const programSettingsSchema = new mongoose.Schema({
    key: {
        type: String,
        default: "program",
        unique: true,
        immutable: true
    },
    // "YYYY-MM-DD" rather than a Date: `new Date("2026-07-27")` parses as UTC
    // midnight, and the server runs UTC while the cohort does not, which would
    // shift the Monday boundary by a day. Parsed with the same split('-')
    // pattern the assignment controller already uses for due dates.
    startDate: {
        type: String,
        default: null
    },
    // When set, pins the current week regardless of startDate (breaks, holidays).
    // null means the week is computed from startDate.
    weekOverride: {
        type: Number,
        default: null
    },
    totalWeeks: {
        type: Number,
        default: 24
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SOWusers",
        default: null
    },
}, {
    timestamps: true
});

module.exports = mongoose.model("ProgramSettings", programSettingsSchema);
