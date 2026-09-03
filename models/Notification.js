const mongoose = require("mongoose");

// One row per recipient per event. Fan-out is written with insertMany so a
// task posted to a 40-student stack costs one round trip.
const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SOWusers",
        required: true
    },
    type: {
        type: String,
        enum: [
            "assignment_posted",
            "exception_requested",
            "exception_reviewed",
            "exception_blocked"
        ],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
    // A client route, e.g. "/assessments?week=3". The bell navigates here.
    link: {
        type: String
    },
    // Mongoose strips keys that are not declared here, so anything a caller
    // wants to round-trip on `data` needs a field.
    data: {
        assignment: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment" },
        exceptionRequest: { type: mongoose.Schema.Types.ObjectId, ref: "ClassExceptionRequest" },
        // The student an "exception_blocked" notice is about - also the key the
        // once-a-day dedupe check looks up.
        blockedStudent: { type: mongoose.Schema.Types.ObjectId, ref: "SOWusers" }
    },
    read: {
        type: Boolean,
        default: false
    },
    // Email delivery is best-effort, and tracking it per row is what makes it
    // recoverable: without this, a Gmail failure is invisible and unretryable.
    // "skip" means this notification was never meant to be emailed.
    // "sending" is the claim: a dispatcher flips a row to it atomically before
    // handing it to SMTP, so two concurrent dispatchers can never both send the
    // same row. A row stranded in "sending" (the process died mid-send) is
    // reclaimed by dispatchPendingEmails once it goes stale.
    emailStatus: {
        type: String,
        enum: ["skip", "pending", "sending", "sent", "failed"],
        default: "skip"
    },
    emailError: {
        type: String
    },
    // Snapshotted at creation so dispatch needs no join back to the user.
    recipientEmail: {
        type: String
    },
    recipientName: {
        type: String
    },
    emailSubject: {
        type: String
    },
    // Just the template variables, not the rendered HTML: the body is built at
    // dispatch time by the template registry in services/notificationService.js.
    // Storing the rendered template would mean 40 near-identical copies of it
    // per posted task.
    emailPayload: {
        type: mongoose.Schema.Types.Mixed
    }
}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });
notificationSchema.index({ emailStatus: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
