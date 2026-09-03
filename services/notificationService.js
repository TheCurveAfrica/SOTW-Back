const Notification = require("../models/Notification");
const sendMail = require("../utils/email");
const {
    generateTaskPostedEmail,
    generateExceptionRequestEmail,
    generateExceptionReviewedEmail
} = require("../utils/notificationEmails");

// Gmail SMTP throttles bursts and caps out around 500 messages a day, and the
// API runs on serverless functions with a hard timeout. So mail goes out a few
// at a time rather than all at once (which Gmail rejects) or one after another
// (which would hold the tutor's "Upload Task" request open for a full stack).
const EMAIL_BATCH_SIZE = 5;
const EMAIL_BATCH_DELAY_MS = 400;
const DEFAULT_DISPATCH_LIMIT = 50;

// How long a row may sit claimed ("sending") before another dispatcher assumes
// the process holding it died and takes it back. Comfortably longer than any
// single SMTP round trip.
const STALE_SENDING_MS = 5 * 60 * 1000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Bodies are rendered at dispatch time from the variables stored on the row, so
// a notification never carries a rendered 3KB template through the database.
const EMAIL_TEMPLATES = {
    assignment_posted: generateTaskPostedEmail,
    exception_requested: generateExceptionRequestEmail,
    exception_reviewed: generateExceptionReviewedEmail
};

// Write one notification per recipient, then start sending any email they carry.
//
// `users` are user documents (needs _id, name, email). `email`, when given, is
// { subject, payload } or { subject, payload: (user) => ({...}) } - payload
// holds the template variables for EMAIL_TEMPLATES[type].
//
// Returns the created rows. Callers should treat a throw here as non-fatal:
// failing to announce a task must never fail creating it.
const notifyUsers = async ({ users, type, title, body, link, data, email }) => {
    const recipients = (users || []).filter((user) => user && user._id);
    if (!recipients.length) return [];

    const wantsEmail = Boolean(email && EMAIL_TEMPLATES[type]);

    const rows = recipients.map((user) => {
        const base = {
            recipient: user._id,
            type,
            title,
            body,
            link,
            data,
            emailStatus: wantsEmail && user.email ? "pending" : "skip"
        };

        if (base.emailStatus !== "pending") return base;

        return {
            ...base,
            recipientEmail: user.email,
            recipientName: user.name,
            emailSubject: email.subject,
            emailPayload: typeof email.payload === "function"
                ? email.payload(user)
                : email.payload
        };
    });

    const created = await Notification.insertMany(rows);

    if (wantsEmail) {
        // Deliberately NOT awaited. The insertMany above is the only thing the
        // caller waits for, so a tutor's "Upload Task" returns immediately while
        // a stack's worth of mail goes out behind it - awaiting it would hold
        // the request open for the better part of a minute.
        //
        // This works because the API runs as a persistent Node process. If a
        // deploy or restart cuts a send short, the rows stay "pending" and
        // POST /api/notifications/dispatch-emails picks them back up.
        dispatchPendingEmails({ limit: created.length })
            .catch((err) => console.error("Notification email dispatch failed:", err.message));
    }

    return created;
};

// Atomically take ownership of a row. Returns the claimed document, or null if
// another dispatcher got there first - the filter only matches while the row is
// still claimable, so the flip to "sending" is the lock.
//
// A row already in "sending" is claimable only once it has gone stale. Without
// that second condition the lock does not hold: a concurrent dispatcher would
// match the row the first one is mid-send on and mail the recipient twice.
const claim = (notificationId, statuses, staleBefore) => Notification.findOneAndUpdate(
    {
        _id: notificationId,
        $or: [
            { emailStatus: { $in: statuses } },
            { emailStatus: "sending", updatedAt: { $lt: staleBefore } }
        ]
    },
    { $set: { emailStatus: "sending" } },
    { returnDocument: "after" }
);

// Send one claimed notification's email and stamp the outcome on its row.
const deliverOne = async (notification) => {
    const template = EMAIL_TEMPLATES[notification.type];

    if (!template || !notification.recipientEmail) {
        await Notification.updateOne(
            { _id: notification._id },
            { $set: { emailStatus: "failed", emailError: "No template or recipient address" } }
        );
        return false;
    }

    // The row is already claimed at this point, so anything that throws here
    // must release it - otherwise it sits in "sending" until it goes stale.
    try {
        const html = template({
            ...(notification.emailPayload || {}),
            studentName: notification.emailPayload?.studentName ?? notification.recipientName,
            tutorName: notification.emailPayload?.tutorName ?? notification.recipientName
        });

        // sendMail returns { success, message } instead of throwing.
        const result = await sendMail({
            email: notification.recipientEmail,
            subject: notification.emailSubject || notification.title,
            html
        });

        await Notification.updateOne(
            { _id: notification._id },
            result.success
                ? { $set: { emailStatus: "sent" }, $unset: { emailError: 1 } }
                : { $set: { emailStatus: "failed", emailError: result.message } }
        );

        return result.success;
    } catch (err) {
        await Notification.updateOne(
            { _id: notification._id },
            { $set: { emailStatus: "failed", emailError: err.message } }
        );
        return false;
    }
};

// Drain pending notification emails in small batches.
//
// Idempotent: every row is claimed atomically before it is handed to SMTP, so
// concurrent dispatchers divide the work rather than double-sending it. Safe to
// re-run at any time - pass includeFailed to also retry ones that errored.
const dispatchPendingEmails = async ({ limit = DEFAULT_DISPATCH_LIMIT, includeFailed = false } = {}) => {
    const statuses = includeFailed ? ["pending", "failed"] : ["pending"];

    // Rows left in "sending" by a process that died mid-send are stranded, so
    // once they are older than the stale window they become claimable again.
    const staleBefore = new Date(Date.now() - STALE_SENDING_MS);
    const candidates = await Notification.find({
        $or: [
            { emailStatus: { $in: statuses } },
            { emailStatus: "sending", updatedAt: { $lt: staleBefore } }
        ]
    })
        .sort({ createdAt: 1 })
        .limit(limit)
        .select("_id");

    if (!candidates.length) return { attempted: 0, sent: 0, failed: 0, skipped: 0 };

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < candidates.length; i += EMAIL_BATCH_SIZE) {
        const batch = candidates.slice(i, i + EMAIL_BATCH_SIZE);

        const outcomes = await Promise.allSettled(batch.map(async ({ _id }) => {
            const notification = await claim(_id, statuses, staleBefore);
            if (!notification) return "skipped";
            return (await deliverOne(notification)) ? "sent" : "failed";
        }));

        outcomes.forEach((outcome) => {
            if (outcome.status === "rejected") failed += 1;
            else if (outcome.value === "sent") sent += 1;
            else if (outcome.value === "skipped") skipped += 1;
            else failed += 1;
        });

        if (i + EMAIL_BATCH_SIZE < candidates.length) await delay(EMAIL_BATCH_DELAY_MS);
    }

    return { attempted: candidates.length - skipped, sent, failed, skipped };
};

// notifyUsers wrapped so a notification failure can never take down the action
// that triggered it. Every caller in a request path should use this.
const notifyUsersSafely = async (options) => {
    try {
        return await notifyUsers(options);
    } catch (err) {
        console.error(`Notification fan-out failed (${options?.type}):`, err.message);
        return [];
    }
};

module.exports = {
    notifyUsers,
    notifyUsersSafely,
    dispatchPendingEmails
};
