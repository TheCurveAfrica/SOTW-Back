const express = require('express');

const router = express.Router();

const { signUp, verify, logIn, forgotPassword, resetPasswordPage, resetPassword, signOut, } = require('../controllers/userController');
const { checkIn, assessmentData, assessmentDataS, fetchCheckInWeekly, fetchAllCheckInWeekly, fetchAttendanceOverview, fetchAssessmentData, fetchOneAssessmentData, deleteCheckIn, deleteWeekCheckIn, deleteAssessment,  runCheck, confirmPayment, healthCheck} = require('../controllers/punctualityController');
const { authenticate, authorizedTutor, } = require("../middleware/authentation");

const upload = require('../middleware/multer');


/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - firstName
 *         - lastName
 *         - email
 *         - password
 *         - token
 *         - data
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated id of the user
 *         firstName:
 *           type: string
 *           description: The first name of the use
 *         lastName:
 *           type: string
 *           description: The lastName of the user
 *         email:
 *           type: string
 *           description: the email of the user
 *         password:
 *           type: string
 *           description: the password of the user
 *         token:
 *           type: string
 *           description: the token for reset password and very user
 *         data:
 *           type: array
 *           description: other info of the user
 *         createdAt:
 *           type: string
 *           format: date
 *           description: The date the user was added
 *       example:
 *         id: d5fE_asz
 *         firstName: Colin
 *         lastName: Decorce
 *         email: info@gmail.com
 *         password: info@gmail.com
 *         token: info@gmail.com
 *         data: [info@gmail.com]
 *         createdAt: 2020-03-10T04:05:06.157Z
 *     Data:
 *        type: object
 *        required:
 *          - date
 *          - time
 *          - location
 *          - userId
 *     Assessment:
 *         type: object
 *         required:
 *           - userId
 *         example:
 *           userId: d5fE_asz
 *           weekStart: 22-09-24
 *           weekEnd: 25-09-24
 *           averagePunctualityScore: 22
 *           createdAt: 2020-03-10T04:05:06.157Z
 */

/**
 * @swagger
 * tags:
 *   name: Punctuality
 *   description: The Punctuality managing API
 * /checkIn:
 *   post:
 *     summary: Create a new check-in for a user
 *     tags: [Punctuality]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Data'
 *     responses:
 *       200:
 *         description: The created check-in.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Data'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Some server error
 *
 */

//endpoint to register a new user
router.post('/signup', signUp);

//confirm payment
router.post('/confirm', confirmPayment);

//endpoint to verify a registered user
router.get('/verify/:id/:token', verify);

//endpoint to login a verified user
router.post('/login', logIn);

//endpoint for forget Password
router.post('/forgot', forgotPassword);

//endpoint for reset Password Page
router.get('/reset/:userId', resetPasswordPage);
''
//endpoint to reset user Password
router.post('/reset-user/:userId', resetPassword);

//endpoint to sign out a user
router.post("/signout", authenticate, signOut);


router.get("/runCheck/:id", runCheck)

//endpoint to add user location and image
// router.post("/checkIn", authenticate, checkIn);
router.post("/checkIn", authenticate, upload.single('image'),checkIn);

//endpoint to get a student Data and calculate the average punctuality for the current week
router.get('/assessment/:userId', authenticate, assessmentData);

router.get('/health', healthCheck);

/**
 * @swagger
 * tags:
 *   name: Assessment
 *   description: Assessment part of the App
 * /api/v1/assessmentAll:
 *   get:
 *     summary: get all assessments
 *     tags: [Assessment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All assessments.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Assessment'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Some server error
 *     
 */

//endpoint to get all students Data and calculate their average punctuality for the current week
router.get('/assessmentAll', authenticate, assessmentDataS);

//endpoint to get a student attendance data
router.get("/studentAttendance/:userId", authenticate, fetchCheckInWeekly);

//endpoint to get all students attendance data
router.get("/groupStudentAttendance", authenticate, fetchAllCheckInWeekly);

//endpoint to get every student with their attendance rolled up (tutors/admins)
router.get("/attendanceOverview", authorizedTutor, fetchAttendanceOverview);

//endpoint to get all student assessment data for a particular week
router.get("/fetchAssessment", authenticate, fetchAssessmentData);

//endpoint to get a student assessment data for a particular week
router.get("/fetchOneAssessment/:userId", authenticate, fetchOneAssessmentData);

//endpoint to delete a student checkIn data
router.delete("/deleteCheckIn/:checkInID", authenticate, deleteCheckIn);

//endpoint to delete a student checkIn data for the full week
router.delete("/deleteCheckInfullWeek/:userId", deleteWeekCheckIn);

//endpoint to delete assessment for a particular student
router.delete("/deleteAssessment/:assessmentId", authenticate, deleteAssessment);



module.exports = router;