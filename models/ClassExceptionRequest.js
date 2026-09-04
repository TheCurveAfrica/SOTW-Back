const mongoose = require("mongoose");

// A student's request to be excused from a single class day.
//
// Each student gets an allowance of these per program (QUOTA in
// controllers/classExceptionController.js). Once it is spent they can still
// file emergency requests, which sit outside the allowance and are flagged with
// isEmergency below.
const classExceptionRequestSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SOWusers",
        required: true,
        index: true
    },
    // "YYYY-MM-DD" rather than a Date, matching dataModel.date so the two can be
    // compared without timezone conversion. Always an eligible day
    // (EXCEPTION_DAYS in the controller: Mon/Wed/Fri, plus Sat).
    date: {
        type: String,
        required: true
    },
    // Filed after the allowance ran out. Does not consume the allowance - it
    // only exists once there is none left - and only one may be Pending at a
    // time, so an out-of-days student cannot queue up a backlog for tutors.
    isEmergency: {
        type: Boolean,
        default: false
    },
    reasonCategory: {
        type: String,
        enum: [
            "Medical",
            "Family emergency",
            "Work / Interview",
            "Travel",
            "Bereavement",
            "Extra-curricular event",
            "Other"
        ],
        required: true
    },
    reason: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    impactAcknowledged: {
        type: Boolean,
        default: false
    },
    catchUpPlan: {
        type: String,
        trim: true,
        maxlength: 500
    },
    status: {
        type: String,
        enum: ["Pending", "Approved", "Declined"],
        default: "Pending",
        index: true
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SOWusers",
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    reviewNote: {
        type: String,
        trim: true
    },
    // The quota window key: a snapshot of ProgramSettings.startDate taken when
    // the request was made. Scoping the count to it means a new cohort - or a
    // corrected start date - resets everyone's allowance with no migration.
    programStartDate: {
        type: String,
        default: null
    },
    weekAtRequest: {
        type: Number
    }
}, { timestamps: true });

// The allowance count filters on exactly these four fields.
classExceptionRequestSchema.index({ student: 1, programStartDate: 1, status: 1, isEmergency: 1 });

module.exports = mongoose.model("ClassExceptionRequest", classExceptionRequestSchema);
