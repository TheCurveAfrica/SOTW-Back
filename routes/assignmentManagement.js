const express = require("express");
const router = express.Router();
const {
    // Assignment Management
    createAssignment,
    getAssignmentsByWeekAndStack,
    getAssignmentsByWeek,
    getAllAssignments,
    updateAssignment,
    deleteAssignment,
    
    // Submission Management
    submitAssignment,
    getStudentSubmissions,
    getSubmissionById,
    
    // Grading Management
    gradeSubmission,
    getSubmissionsByWeek,
    getSubmissionsByAssignment,
    getStudentSubmissionsByTutor,

    // Performance Review
    getStudentPerformanceReview,

    // Weekly Assignment Scores
    getStudentAssignmentScores
} = require("../controllers/assignmentManagementController");
// NOTE: authorizedTutor calls authenticate internally, so it replaces it rather
// than being chained after it.
const { authenticate, authorizedTutor } = require("../middleware/authentation");

// ============== ASSIGNMENT ROUTES ==============

// Create assignment (tutors only)
router.post("/assignments/create", authorizedTutor, createAssignment);

// Get assignments by week and stack (for students)
router.get("/assignments/week/:week", authenticate, getAssignmentsByWeekAndStack);

// Get a week's assignments for the requested stack plus anything issued to
// "General" (also used by the student task board, so it stays on authenticate
// rather than authorizedTutor)
router.get("/assignments/week/:week/all", authenticate, getAssignmentsByWeek);

// Get all assignments (for tutors)
router.get("/assignments/all", authenticate, getAllAssignments);

// Update assignment
router.patch("/assignments/:assignmentId", authorizedTutor, updateAssignment);

// Delete assignment
router.delete("/assignments/:assignmentId", authorizedTutor, deleteAssignment);

// ============== SUBMISSION ROUTES ==============

// Submit assignment (students only)
router.post("/submissions/:assignmentId/submit", authenticate, submitAssignment);

// Get student's submissions
router.get("/submissions/my-submissions", authenticate, getStudentSubmissions);

// Might be used for both students and tutors, with different filters
router.get("/submissions/student/:id", authenticate, getStudentSubmissionsByTutor);

// Get specific submission by ID (for tutors)
router.get("/submissions/:submissionId", authenticate, getSubmissionById);

// ============== GRADING ROUTES ==============

// Grade a submission (tutors only)
router.patch("/grading/submission/:submissionId", authorizedTutor, gradeSubmission);

// Get submissions by week for grading (tutors only)
router.get("/grading/week/:week", authorizedTutor, getSubmissionsByWeek);

// Get submissions by assignment (tutors only)
router.get("/grading/assignment/:assignmentId", authorizedTutor, getSubmissionsByAssignment);

// ============== PERFORMANCE REVIEW ROUTE ==============
// Get a student's performance review (tutors/admins/students)
router.get("/students/:id/performance-review", authenticate, getStudentPerformanceReview);

// Get a student's cumulative assignment score out of 20 per week
// (tutors/admins/students), optionally narrowed with ?week=N
router.get("/students/:id/assignment-scores", authenticate, getStudentAssignmentScores);

module.exports = router;