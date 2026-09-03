const mongoose = require("mongoose");

// A student's request to be excused from one or more class days.
//
// The allowance (see QUOTA in controllers/classExceptionController.js) is
// enforced server-side and deliberately never serialized to students, so the
// shape of this document is split by audience at the controller boundary
// rather than here.
const classExceptionRequestSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SOWusers",
        required: true,
        index: true
    },
    // "YYYY-MM-DD" strings rather than Dates, matching dataModel.date so the
    // two can be compared without timezone conversion. Every entry is a class
    // day (Mon/Wed/Fri per utils/attendance.js), validated in the controller.
    dates: {
        type: [String],
        required: true
    },
    reasonCategory: {
        type: String,
        enum: ["Medical", "Family emergency", "Work / Interview", "Travel", "Bereavement", "Other"],
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

// The quota count filters on exactly these three fields.
classExceptionRequestSchema.index({ student: 1, programStartDate: 1, status: 1 });

module.exports = mongoose.model("ClassExceptionRequest", classExceptionRequestSchema);
