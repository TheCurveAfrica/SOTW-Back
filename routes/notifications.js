const express = require("express");
const router = express.Router();
const {
    getNotifications,
    markAsRead,
    markAllAsRead,
    dispatchEmails
} = require("../controllers/notificationController");
// NOTE: authorizedTutor calls authenticate internally, so it replaces it rather
// than being chained after it.
const { authenticate, authorizedTutor } = require("../middleware/authentation");

// The signed-in user's notifications, newest first, plus their unread count.
// Optional ?limit= and ?unreadOnly=true
router.get("/notifications", authenticate, getNotifications);

// Mark every notification read. Declared before the :id route so "read-all" is
// not swallowed as an id.
router.patch("/notifications/read-all", authenticate, markAllAsRead);

// Mark one notification read (only ever the caller's own)
router.patch("/notifications/:id/read", authenticate, markAsRead);

// Retry notification emails left pending or failed. Stands in for the cron job
// this codebase does not have; safe to call repeatedly.
router.post("/notifications/dispatch-emails", authorizedTutor, dispatchEmails);

module.exports = router;
