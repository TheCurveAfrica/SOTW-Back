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
    getStudentPerformanceReview
} = require("../controllers/assignmentManagementController");
const { authenticate } = require("../middleware/authentation");

// ============== ASSIGNMENT ROUTES ==============

// Create assignment (tutors only)
router.post("/assignments/create", authenticate, createAssignment);

// Get assignments by week and stack (for students)
router.get("/assignments/week/:week", authenticate, getAssignmentsByWeekAndStack);

// Get all assignments by week (for tutors)
router.get("/assignments/week/:week/all", authenticate, getAssignmentsByWeek);

// Get all assignments (for tutors)
router.get("/assignments/all", authenticate, getAllAssignments);

// Update assignment
router.patch("/assignments/:assignmentId", authenticate, updateAssignment);

// Delete assignment
router.delete("/assignments/:assignmentId", authenticate, deleteAssignment);

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
router.patch("/grading/submission/:submissionId", authenticate, gradeSubmission);

// Get submissions by week for grading (tutors only)
router.get("/grading/week/:week", authenticate, getSubmissionsByWeek);

// Get submissions by assignment (tutors only)
router.get("/grading/assignment/:assignmentId", authenticate, getSubmissionsByAssignment);

// ============== PERFORMANCE REVIEW ROUTE ==============
// Get a student's performance review (tutors/admins/students)
router.get("/students/:id/performance-review", authenticate, getStudentPerformanceReview);

module.exports = router;