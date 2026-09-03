const express = require("express");
const router = express.Router();
const {
    createExceptionRequest,
    getMyExceptionRequests,
    getExceptionRequests,
    reviewExceptionRequest
} = require("../controllers/classExceptionController");
// NOTE: authorizedTutor calls authenticate internally, so it replaces it rather
// than being chained after it.
const { authenticate, authorizedTutor } = require("../middleware/authentation");

// ============== STUDENT ROUTES ==============

// Request to be excused from one or more class days. There is no student-only
// middleware in this codebase, so the role check lives in the handler.
router.post("/class-exceptions", authenticate, createExceptionRequest);

// The requesting student's own history. Never carries the allowance.
router.get("/class-exceptions/mine", authenticate, getMyExceptionRequests);

// ============== TUTOR ROUTES ==============

// The review queue, pending first. Optional ?status= and ?stack=
router.get("/class-exceptions", authorizedTutor, getExceptionRequests);

// Approve or decline a pending request
router.patch("/class-exceptions/:id/review", authorizedTutor, reviewExceptionRequest);

module.exports = router;
