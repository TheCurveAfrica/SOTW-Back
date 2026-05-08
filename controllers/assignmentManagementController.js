const Assignment = require("../models/Assignment");
const AssignmentSubmission = require("../models/AssignmentSubmission");
const User = require("../models/users");
const ApiError = require("../error/ApiError");

// Helper function to format date 
const formatDueDate = (date) => {
    const options = {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };

    const formatted = new Intl.DateTimeFormat('en-GB', options).format(date);

    // Add ordinal suffix to day
    const day = date.getDate();
    let suffix = 'th';
    if (day % 10 === 1 && day !== 11) suffix = 'st';
    else if (day % 10 === 2 && day !== 12) suffix = 'nd';
    else if (day % 10 === 3 && day !== 13) suffix = 'rd';

    return formatted.replace(/^\d+/, `${day}${suffix}`);
};

// ============== ASSIGNMENT MANAGEMENT ==============

// Create Assignment
const createAssignment = async (req, res, next) => {
    try {
        const { week, title, taskDescription, stack, dueDate, dueTime, allowLateSubmissions } = req.body;

        if (!week || week < 1 || !title || !taskDescription || !stack || !dueDate || !dueTime) {
            return next(ApiError.badRequest("Missing required fields"));
        }


        // Combine date and time
        const [year, month, day] = dueDate.split('-');
        const [hours, minutes] = dueTime.split(':');
        const dueDateTime = new Date(year, month - 1, day, hours, minutes);

        // Calculate the start of the requested week (Monday 00:00)
        const now = new Date();
        // Get current day of week (0=Sunday, 1=Monday, ... 6=Saturday)
        const currentDay = now.getDay();
        // Calculate how many days to subtract to get to Monday
        const daysSinceMonday = (currentDay + 6) % 7;
        // Get the Monday of the current week
        const mondayThisWeek = new Date(now);
        mondayThisWeek.setHours(0, 0, 0, 0);
        mondayThisWeek.setDate(now.getDate() - daysSinceMonday);

        // Calculate the Monday for the requested week
        const weekNumber = Number(week);
        const mondayOfRequestedWeek = new Date(mondayThisWeek);
        mondayOfRequestedWeek.setDate(mondayThisWeek.getDate() + 7 * (weekNumber - 1));

        // Calculate the cutoff: 12:00 am Monday of the next week
        const mondayNextWeek = new Date(mondayOfRequestedWeek);
        mondayNextWeek.setDate(mondayOfRequestedWeek.getDate() + 7);
        mondayNextWeek.setHours(0, 0, 0, 0);

        // Validate dueDateTime is before the next Monday 12:00 am
        if (dueDateTime >= mondayNextWeek) {
            return next(ApiError.badRequest("Due date/time must be before 12:00 am Monday of the next week for the selected week."));
        }

        const assignment = new Assignment({
            week,
            title,
            taskDescription,
            stack,
            dueDateTime,
            allowLateSubmissions
        });

        await assignment.save();

        res.status(201).json({
            message: "Assignment created successfully",
            assignment: {
                ...assignment.toObject(),
                formattedDueDate: formatDueDate(assignment.dueDateTime)
            }
        });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Get assignments by week and stack (for students)
const getAssignmentsByWeekAndStack = async (req, res, next) => {
    try {
        const { week } = req.params;
        const stack = req.user?.stack;


        // Find assignments for the student's stack and 'General'
        const assignments = await Assignment.find({
            week: Number(week),
            stack: { $in: [stack, 'General'] }
        })
        .sort({ createdAt: -1 });

        const formattedAssignments = assignments.map(assignment => ({
            ...assignment.toObject(),
            formattedDueDate: formatDueDate(assignment.dueDateTime)
        }));

        res.status(200).json({ assignments: formattedAssignments });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Get all assignments by week (for tutors)
const getAssignmentsByWeek = async (req, res, next) => {
    try {
        const { week } = req.params;
        const { stack } = req.query;

        if (week === undefined || week === "" || isNaN(Number(week)) || Number(week) < 1) {
            return next(ApiError.badRequest("Valid week parameter is required"));
        }

        if (!stack || stack === "" || !["Front End", "Back End", "Product Design", 'General'].includes(stack)) {
            return next(ApiError.badRequest("Stack parameter is required"));
        }

        const assignments = await Assignment.find({ week: Number(week), stack: stack })
            .sort({ stack: 1, createdAt: -1 });

        const formattedAssignments = assignments.map(assignment => ({
            ...assignment.toObject(),
            formattedDueDate: formatDueDate(assignment.dueDateTime)
        }));

        res.status(200).json({ assignments: formattedAssignments });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Get all assignments
const getAllAssignments = async (req, res, next) => {
    try {
        const assignments = await Assignment.find()
            .sort({ week: -1, stack: 1, createdAt: -1 });

        const formattedAssignments = assignments.map(assignment => ({
            ...assignment.toObject(),
            formattedDueDate: formatDueDate(assignment.dueDateTime)
        }));

        res.status(200).json({ assignments: formattedAssignments });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Update assignment
const updateAssignment = async (req, res, next) => {
    try {
        const { assignmentId } = req.params;
        const { title, taskDescription, stack, dueDate, dueTime, allowLateSubmissions } = req.body;

        // Build update object with only provided fields
        const updateFields = {};

        if (title !== undefined) updateFields.title = title;
        if (taskDescription !== undefined) updateFields.taskDescription = taskDescription;
        if (stack !== undefined) updateFields.stack = stack;
        if (allowLateSubmissions !== undefined) updateFields.allowLateSubmissions = allowLateSubmissions;

        // Handle date/time updates
        if (dueDate && dueTime) {
            // Both date and time provided - update dueDateTime
            const [year, month, day] = dueDate.split('-');
            const [hours, minutes] = dueTime.split(':');
            updateFields.dueDateTime = new Date(year, month - 1, day, hours, minutes);
        } else if (dueDate || dueTime) {
            // Only one of date or time provided - get current assignment to merge
            const currentAssignment = await Assignment.findById(assignmentId);
            if (!currentAssignment) {
                return next(ApiError.notFound("Assignment not found"));
            }

            const currentDateTime = currentAssignment.dueDateTime;
            if (dueDate) {
                // Update only the date part, keep current time
                const [year, month, day] = dueDate.split('-');
                updateFields.dueDateTime = new Date(
                    year, 
                    month - 1, 
                    day, 
                    currentDateTime.getHours(), 
                    currentDateTime.getMinutes()
                );
            } else if (dueTime) {
                // Update only the time part, keep current date
                const [hours, minutes] = dueTime.split(':');
                updateFields.dueDateTime = new Date(
                    currentDateTime.getFullYear(),
                    currentDateTime.getMonth(),
                    currentDateTime.getDate(),
                    hours,
                    minutes
                );
            }
        }

        // Check if there are any fields to update
        if (Object.keys(updateFields).length === 0) {
            return next(ApiError.badRequest("No valid fields provided for update"));
        }

        const assignment = await Assignment.findByIdAndUpdate(
            assignmentId,
            updateFields,
            { new: true }
        );

        if (!assignment) {
            return next(ApiError.notFound("Assignment not found"));
        }

        res.status(200).json({
            message: "Assignment updated successfully",
            assignment: {
                ...assignment.toObject(),
                formattedDueDate: formatDueDate(assignment.dueDateTime)
            }
        });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Delete assignment
const deleteAssignment = async (req, res, next) => {
    try {
        const { assignmentId } = req.params;

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
            return next(ApiError.notFound("Assignment not found"));
        }

        // Delete all related submissions
        await AssignmentSubmission.deleteMany({ assignment: assignmentId });
        await Assignment.findByIdAndDelete(assignmentId);

        res.status(200).json({ message: "Assignment and all related data deleted successfully" });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// ============== SUBMISSION MANAGEMENT ==============

// Submit assignment
const submitAssignment = async (req, res, next) => {
    try {
        const { assignmentId } = req.params;
        const { submissionLink } = req.body;
        const studentId = req.user?.id;

        // Check if submission link is provided
        if (!submissionLink) {
            return next(ApiError.badRequest("Submission link is required"));
        }

        // Get assignment details
        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
            return next(ApiError.notFound("Assignment not found"));
        }

        // Get student details to verify stack
        const student = await User.findById(studentId);
        if (!student || student.role !== "student") {
            return next(ApiError.forbidden("Only students can submit assignments"));
        }

        // Verify student can submit to this assignment (stack validation)
        const normalizeStack = (stack) => stack?.toLowerCase().replace(/\s+/g, "");
        if (
            normalizeStack(assignment.stack) !== "general" &&
            normalizeStack(assignment.stack) !== normalizeStack(student.stack)
        ) {
            return next(ApiError.forbidden("You cannot submit to this assignment as it is not for your stack"));
        }

        // Check if deadline has passed and late submissions are not allowed
        const now = new Date();
        const isLate = now > assignment.dueDateTime;

        if (isLate && !assignment.allowLateSubmissions) {
            return next(ApiError.badRequest("Submission deadline has passed and late submissions are not allowed"));
        }

        // Check if student already submitted (upsert behavior)
        const existingSubmission = await AssignmentSubmission.findOne({
            assignment: assignmentId,
            student: studentId
        });

        if (existingSubmission) {
            // Update existing submission
            existingSubmission.submissionLink = submissionLink;
            existingSubmission.submittedAt = now;
            existingSubmission.isLate = isLate;
            await existingSubmission.save();

            res.status(200).json({
                message: "Assignment submission updated successfully",
                submission: existingSubmission
            });
        } else {
            // Create new submission
            const submission = new AssignmentSubmission({
                assignment: assignmentId,
                student: studentId,
                submissionLink,
                submittedAt: now,
                isLate
            });

            await submission.save();

            res.status(201).json({
                message: "Assignment submitted successfully",
                submission
            });
        }
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Get student's submissions by tutor view (with optional week filter)
const getStudentSubmissionsByTutor = async (req, res, next) => {
    try {
        const studentId = req.params.id;
        const { week } = req.query;

        let query = { student: studentId };
        if (week) {
            // Find assignments for the specific week first
            const assignments = await Assignment.find({ week: Number(week) });
            const assignmentIds = assignments.map(a => a._id);
            query.assignment = { $in: assignmentIds };
        }

        const submissions = await AssignmentSubmission.find(query)
            .populate('assignment')
            .sort({ submittedAt: -1 });

        res.status(200).json({ submissions });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Get student's submissions
const getStudentSubmissions = async (req, res, next) => {
    try {
        const studentId = req.user?.id;
        const { week } = req.query;

        let query = { student: studentId };
        if (week) {
            // Find assignments for the specific week first
            const assignments = await Assignment.find({ week: Number(week) });
            const assignmentIds = assignments.map(a => a._id);
            query.assignment = { $in: assignmentIds };
        }

        const submissions = await AssignmentSubmission.find(query)
            .populate('assignment')
            .sort({ submittedAt: -1 });

        res.status(200).json({ submissions });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Get submission by ID (for tutors to view specific submission)
const getSubmissionById = async (req, res, next) => {
    try {
        const { submissionId } = req.params;

        const submission = await AssignmentSubmission.findById(submissionId)
            .populate('assignment')
            .populate('student', 'name image stack');

        if (!submission) {
            return next(ApiError.notFound("Submission not found"));
        }

        res.status(200).json({ submission });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// ============== GRADING MANAGEMENT ==============

// Grade a submission
const gradeSubmission = async (req, res, next) => {
    try {
        const { submissionId } = req.params;
        const { grade, feedback } = req.body;

        // Validate grade
        if ( !grade || grade < 0 || grade > 20) {
            return next(ApiError.badRequest("Grade must be between 0 and 20"));
        }

        // Verify submission exists
        const submission = await AssignmentSubmission.findById(submissionId);
        if (!submission) {
            return next(ApiError.notFound("Submission not found"));
        }

        // Update submission with grade and feedback
        submission.grade = grade;
        submission.feedback = feedback;
        submission.status = "Graded";
        await submission.save();

        res.status(200).json({
            message: submission.grade !== undefined && submission.grade !== null ? "Grade updated successfully" : "Assignment graded successfully",
            grade: submission.grade,
            feedback: submission.feedback
        });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Get submissions by week for grading (tutor view)
const getSubmissionsByWeek = async (req, res, next) => {
    try {
        const { week } = req.params;

        // Get all assignments for the week
        const assignments = await Assignment.find({ week: Number(week) });
        const assignmentIds = assignments.map(a => a._id);

        if (assignmentIds.length === 0) {
            return res.status(200).json({ students: [] });
        }

        // Get all submissions for these assignments
        const submissions = await AssignmentSubmission.find({
            assignment: { $in: assignmentIds }
        })
            .populate('student', 'name image stack')
            .populate('assignment', 'title stack');

        // Group submissions by student
        const studentMap = new Map();

        submissions.forEach(submission => {
            const studentId = submission.student._id.toString();

            if (!studentMap.has(studentId)) {
                studentMap.set(studentId, {
                    student: submission.student,
                    assignments: []
                });
            }

            studentMap.get(studentId).assignments.push({
                submissionId: submission._id,
                assignment: submission.assignment,
                submissionLink: submission.submissionLink,
                submittedAt: submission.submittedAt,
                isLate: submission.isLate,
                grade: submission.grade || null
            });
        });

        // Convert map to array and sort assignments by title
        const students = Array.from(studentMap.values()).map(student => ({
            ...student,
            assignments: student.assignments.sort((a, b) => a.assignment.title.localeCompare(b.assignment.title))
        }));

        // Sort students by name
        students.sort((a, b) => a.student.name.localeCompare(b.student.name));

        res.status(200).json({ students });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Get all submissions for a specific assignment
const getSubmissionsByAssignment = async (req, res, next) => {
    try {
        const { assignmentId } = req.params;

        const submissions = await AssignmentSubmission.find({ assignment: assignmentId })
            .populate('student', 'name image stack')
            .populate('assignment', 'title week stack taskDescription')
            .sort({ submittedAt: -1 });

        res.status(200).json({ submissions });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

module.exports = {
    // Assignment Management
    createAssignment,
    getAssignmentsByWeekAndStack,
    getAssignmentsByWeek,
    getAllAssignments,
    updateAssignment,
    deleteAssignment,
    getStudentSubmissionsByTutor,
    
    // Submission Management
    submitAssignment,
    getStudentSubmissions,
    getSubmissionById,
    
    // Grading Management
    gradeSubmission,
    getSubmissionsByWeek,
    getSubmissionsByAssignment
};