const Notification = require("../models/Notification");
const ApiError = require("../error/ApiError");
const { dispatchPendingEmails } = require("../services/notificationService");

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// The bell only needs what it renders, and emailStatus/emailPayload are
// operational detail nobody's client should see.
const serialize = (doc) => ({
    _id: doc._id,
    type: doc.type,
    title: doc.title,
    body: doc.body,
    link: doc.link,
    read: doc.read,
    createdAt: doc.createdAt
});

const getNotifications = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) return next(ApiError.badRequest("Missing user"));

        const parsedLimit = Number(req.query.limit);
        const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, MAX_LIMIT)
            : DEFAULT_LIMIT;

        const filter = { recipient: userId };
        if (req.query.unreadOnly === "true") filter.read = false;

        const [notifications, unreadCount] = await Promise.all([
            Notification.find(filter).sort({ createdAt: -1 }).limit(limit),
            Notification.countDocuments({ recipient: userId, read: false })
        ]);

        res.status(200).json({
            notifications: notifications.map(serialize),
            unreadCount
        });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

const markAsRead = async (req, res, next) => {
    try {
        // recipient is in the filter, not checked after the fact, so one user
        // can never mark another's notification read.
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipient: req.user?.id },
            { $set: { read: true } },
            { returnDocument: "after" }
        );

        if (!notification) return next(ApiError.notFound("Notification not found"));

        const unreadCount = await Notification.countDocuments({ recipient: req.user?.id, read: false });

        res.status(200).json({ message: "Notification marked as read", unreadCount });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

const markAllAsRead = async (req, res, next) => {
    try {
        const result = await Notification.updateMany(
            { recipient: req.user?.id, read: false },
            { $set: { read: true } }
        );

        res.status(200).json({
            message: "All notifications marked as read",
            modifiedCount: result.modifiedCount,
            unreadCount: 0
        });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Drain any notification emails that were left pending - a send that failed, or
// a fan-out cut short by a function timeout. There is no scheduler in this
// codebase, so like resetWeeklyAssessments this is an endpoint something else
// calls rather than a cron job. Idempotent; safe to hit repeatedly.
const dispatchEmails = async (req, res, next) => {
    try {
        const parsedLimit = Number(req.body?.limit);
        const result = await dispatchPendingEmails({
            limit: Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_LIMIT) : undefined,
            includeFailed: req.body?.includeFailed === true
        });

        res.status(200).json({ message: "Dispatch complete", ...result });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
    dispatchEmails
};
