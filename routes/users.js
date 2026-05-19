const express = require('express');
const {createUser, studentDashboard, deleteUser, getUser, getOneUser, updateUser, 
    secondUpdate, getUsers, loginUser,makeAlumni,makeStudent, forgotPassword, resetPassword, updateAllUsersWeekStatus,
       getDashboardStats,
    getAllStaffs,
getAllStudents,
getAllAlumnis,
getSingleStudent,
getSingleStaff,
getSingleAlumni, resetWeeklyAssessments,
getProfile,
getRankingsAndTopAssignments,
changePassword
} = require("../controllers/users.js");
const { authenticate } = require('../middleware/authentation.js');
const upload = require("../middleware/multer.js")
const router = express.Router();

router.post("/create",upload.single("image"), createUser);
router.delete("/remove/:id", authenticate, deleteUser)
router.get("/getUser/:id", authenticate, getUser);
router.get("/oneUser/:id", authenticate, getOneUser);
router.get("/allUsers", authenticate, getUsers);
router.patch("/update",upload.single("image"), authenticate, updateUser);
router.patch("/anotherUpdate/:id", authenticate, secondUpdate);
router.patch("/alumni/:id", authenticate, makeAlumni);
router.patch("/student/:id", authenticate, makeStudent);
router.post("/login", loginUser);
router.post("/forgot", forgotPassword);
router.patch("/reset/:id", resetPassword);
router.patch('/update-all-week-status', authenticate, updateAllUsersWeekStatus);
router.patch('/reset-assessments', authenticate, resetWeeklyAssessments);
router.get("/dashboard", authenticate,studentDashboard);


router.get("/dashboard/stats", authenticate, getDashboardStats);

router.get("/students", authenticate, getAllStudents);
router.get("/staffs", authenticate, getAllStaffs);
router.get("/alumnis", authenticate, getAllAlumnis);


router.get("/students/:id", authenticate, getSingleStudent);
router.get("/staffs/:id", authenticate, getSingleStaff);
router.get("/alumnis/:id", authenticate, getSingleAlumni);

// GET /profile - Get logged-in user's profile and stats
router.get('/profile', authenticate, getProfile);

// Rankings and Top Assignment Scorers
router.get("/rankings", authenticate, getRankingsAndTopAssignments);

router.patch("/change-password", authenticate, changePassword);

module.exports = router;
