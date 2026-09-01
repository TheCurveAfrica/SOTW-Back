const Assignment = require("../models/Assignment");
const AssignmentSubmission = require("../models/AssignmentSubmission");
const User = require("../models/users");
const ApiError = require("../error/ApiError");
const Ratings = require("../models/ratings");
const { sanitizeTaskDescription, htmlToPlainText } = require("../utils/sanitizeTaskDescription");
const { getProgramSettings, getWeekStart } = require("../utils/programWeek");

// Every assignment is graded on the same 0-20 scale, enforced by
// AssignmentSubmission.grade (min: 0, max: 20). There is no per-assignment
// maxScore field, so this is the single source of truth for the ceiling.
const MAX_ASSIGNMENT_SCORE = 20;

// Rich-text descriptions arrive as HTML and must be sanitized before they are stored;
// plain-text ones are kept verbatim. Returns null when the description carries no real text.
const prepareDescription = (taskDescription, descriptionFormat) => {
    if (descriptionFormat !== "html") {
        return { taskDescription, descriptionFormat: "text" };
    }

    const clean = sanitizeTaskDescription(taskDescription);
    if (!htmlToPlainText(clean)) return null;

    return { taskDescription: clean, descriptionFormat: "html" };
};

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
        const { week, title, taskDescription, descriptionFormat, stack, dueDate, dueTime, allowLateSubmissions } = req.body;

        if (!week || week < 1 || !title || !taskDescription || !stack || !dueDate || !dueTime) {
            return next(ApiError.badRequest("Missing required fields"));
        }

        const settings = await getProgramSettings();
        const weekNumber = Number(week);
        if (weekNumber > settings.totalWeeks) {
            return next(ApiError.badRequest(`Week must be between 1 and ${settings.totalWeeks}`));
        }

        const description = prepareDescription(taskDescription, descriptionFormat);
        if (!description) {
            return next(ApiError.badRequest("Task description cannot be empty"));
        }


        // Combine date and time
        const [year, month, day] = dueDate.split('-');
        const [hours, minutes] = dueTime.split(':');
        const dueDateTime = new Date(year, month - 1, day, hours, minutes);

        // Monday 00:00 of the requested program week, anchored to the configured
        // cohort start date. Without a start date this falls back to the current
        // calendar week, matching the behaviour before program settings existed.
        const mondayOfRequestedWeek = getWeekStart(settings, weekNumber);

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
            taskDescription: description.taskDescription,
            descriptionFormat: description.descriptionFormat,
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

// Get a week's assignments for an explicitly requested stack, plus General.
// Serves both the student task board and a tutor viewing a student's board.
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

        // A stack's task list always includes anything issued to "General", matching
        // getAssignmentsByWeekAndStack and getStudentAssignmentScores — otherwise a
        // student is graded on General tasks their task board never showed them.
        // Sorted by due date so the stack's own tasks and the General ones read as
        // one deadline-ordered list rather than clumping by stack name.
        const stacks = stack === "General" ? ["General"] : [stack, "General"];

        const assignments = await Assignment.find({
            week: Number(week),
            stack: { $in: stacks }
        }).sort({ dueDateTime: 1, createdAt: -1 });

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
        const { title, taskDescription, descriptionFormat, stack, dueDate, dueTime, allowLateSubmissions } = req.body;

        // Build update object with only provided fields
        const updateFields = {};

        if (title !== undefined) updateFields.title = title;
        if (taskDescription !== undefined) {
            const description = prepareDescription(taskDescription, descriptionFormat);
            if (!description) {
                return next(ApiError.badRequest("Task description cannot be empty"));
            }
            updateFields.taskDescription = description.taskDescription;
            updateFields.descriptionFormat = description.descriptionFormat;
        }
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

        // runValidators keeps the stack and descriptionFormat enums enforced on update,
        // not just on create.
        const assignment = await Assignment.findByIdAndUpdate(
            assignmentId,
            updateFields,
            { new: true, runValidators: true }
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

        // Validate grade. Coerced explicitly so a numeric string is range-checked
        // as a number, and tested with Number.isFinite so a legitimate 0 is stored
        // rather than rejected as falsy.
        const numericGrade = Number(grade);
        if (!Number.isFinite(numericGrade) || numericGrade < 0 || numericGrade > MAX_ASSIGNMENT_SCORE) {
            return next(ApiError.badRequest(`Grade must be between 0 and ${MAX_ASSIGNMENT_SCORE}`));
        }

        // Verify submission exists
        const submission = await AssignmentSubmission.findById(submissionId);
        if (!submission) {
            return next(ApiError.notFound("Submission not found"));
        }

        // Captured before the assignment below, otherwise the message always
        // reads "updated"
        const wasGraded = submission.grade !== undefined && submission.grade !== null;

        // Update submission with grade and feedback
        submission.grade = numericGrade;
        submission.feedback = feedback;
        submission.status = "Graded";
        await submission.save();

        res.status(200).json({
            message: wasGraded ? "Grade updated successfully" : "Assignment graded successfully",
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
            .populate('assignment', 'title week stack taskDescription descriptionFormat')
            .sort({ submittedAt: -1 });

        res.status(200).json({ submissions });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// ============== PERFORMANCE REVIEW ENDPOINT ==============

// GET /students/:id/performance-review
const getStudentPerformanceReview = async (req, res, next) => {
    try {
        const studentId = req.params.id;

        // Get student details
        const student = await User.findById(studentId);
        if (!student) {
            return next(ApiError.notFound("Student not found"));
        }

        // Normalize stack for matching
        const normalizeStack = (stack) => stack?.toLowerCase().replace(/\s+/g, "");
        const stacksToInclude = [student.stack, "General"];

        // Get all assignments for student's stack and 'General'
        const assignments = await Assignment.find({
            stack: { $in: stacksToInclude }
        }).sort({ week: -1 });

        // Get all submissions for this student
        const submissions = await AssignmentSubmission.find({ student: studentId });
        const submissionsMap = new Map();
        submissions.forEach(sub => submissionsMap.set(String(sub.assignment), sub));

        // Get all ratings for this student
        const ratings = await Ratings.find({ student: studentId });
        // Find all week numbers (from assignments and ratings)
        let allWeeks = [
            ...assignments.map(a => a.week),
            ...ratings.map(r => r.week)
        ];
        // Sort weeks descending and remove duplicates
        const uniqueWeeks = Array.from(new Set(allWeeks)).sort((a, b) => b - a);
        // Try to find the most recent week with a ratings entry
        let currentWeekBreakdown = {};
        for (const week of uniqueWeeks) {
            const foundRating = ratings.find(r => r.week === week);
            if (foundRating) {
                currentWeekBreakdown = {
                    punctuality: foundRating.punctuality,
                    Assignments: foundRating.Assignments,
                    personalDefense: foundRating.personalDefense,
                    classParticipation: foundRating.classParticipation,
                    classAssessment: foundRating.classAssessment,
                    total: foundRating.total
                };
                break;
            }
        }

        // Build assessments array (no ratings)
        const assessments = assignments.map(assignment => {
            const submission = submissionsMap.get(String(assignment._id));
            const week = assignment.week;
            return {
                week,
                assessmentTitle: assignment.title,
                dueDate: assignment.dueDateTime,
                score: submission ? submission.grade ?? null : null,
                status: submission ? (submission.grade !== undefined && submission.grade !== null ? "Graded" : "Pending") : "Not Submitted"
            };
        });

        res.status(200).json({ assessments, currentWeekBreakdown });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// ============== WEEKLY ASSIGNMENT SCORES ==============

// GET /students/:id/assignment-scores?week=N
// Aggregates a student's assignment grades into one cumulative score out of 20
// per week. An assignment that was never submitted, or that has been submitted
// but not yet graded, counts as 0 — the denominator is every assignment issued
// to the student's stack that week, so the score reflects completion as well as
// quality. Omit ?week to get every week.
const getStudentAssignmentScores = async (req, res, next) => {
    try {
        const studentId = req.params.id;

        const student = await User.findById(studentId);
        if (!student) {
            return next(ApiError.notFound("Student not found"));
        }

        // Match getStudentPerformanceReview: a student's workload is their own
        // stack plus anything issued to "General".
        const query = { stack: { $in: [student.stack, "General"] } };

        let requestedWeek = null;
        if (req.query.week !== undefined && req.query.week !== "") {
            requestedWeek = Number(req.query.week);
            if (!Number.isInteger(requestedWeek) || requestedWeek < 1) {
                return next(ApiError.badRequest("week must be a positive integer"));
            }
            query.week = requestedWeek;
        }

        const assignments = await Assignment.find(query).sort({ week: -1, dueDateTime: 1 });

        const submissions = await AssignmentSubmission.find({
            student: studentId,
            assignment: { $in: assignments.map((assignment) => assignment._id) }
        });
        const submissionsMap = new Map();
        submissions.forEach((submission) => submissionsMap.set(String(submission.assignment), submission));

        // Bucket the assignments by week, keeping the sort order established above.
        const weekMap = new Map();
        assignments.forEach((assignment) => {
            const submission = submissionsMap.get(String(assignment._id));
            const isGraded = !!submission && submission.grade !== undefined && submission.grade !== null;

            if (!weekMap.has(assignment.week)) {
                weekMap.set(assignment.week, []);
            }

            weekMap.get(assignment.week).push({
                assignmentId: assignment._id,
                title: assignment.title,
                stack: assignment.stack,
                dueDateTime: assignment.dueDateTime,
                formattedDueDate: formatDueDate(assignment.dueDateTime),
                submissionId: submission ? submission._id : null,
                submissionLink: submission ? submission.submissionLink : null,
                submittedAt: submission ? submission.submittedAt : null,
                isLate: submission ? submission.isLate : false,
                grade: isGraded ? submission.grade : null,
                status: !submission ? "Not Submitted" : isGraded ? "Graded" : "Pending"
            });
        });

        // A week that was explicitly requested but has no assignments still needs
        // an entry, so the caller can render "no tasks issued" rather than nothing.
        if (requestedWeek !== null && !weekMap.has(requestedWeek)) {
            weekMap.set(requestedWeek, []);
        }

        const weeks = Array.from(weekMap.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([week, items]) => {
                const pointsEarned = items.reduce(
                    (sum, item) => sum + (item.grade === null ? 0 : item.grade),
                    0
                );
                const pointsPossible = items.length * MAX_ASSIGNMENT_SCORE;

                return {
                    week,
                    maxScore: MAX_ASSIGNMENT_SCORE,
                    totalAssignments: items.length,
                    submittedCount: items.filter((item) => item.status !== "Not Submitted").length,
                    gradedCount: items.filter((item) => item.status === "Graded").length,
                    pointsEarned,
                    pointsPossible,
                    cumulativeScore: pointsPossible === 0
                        ? null
                        : Math.round((pointsEarned / pointsPossible) * MAX_ASSIGNMENT_SCORE * 100) / 100,
                    assignments: items
                };
            });

        res.status(200).json({
            student: {
                _id: student._id,
                name: student.name,
                image: student.image,
                stack: student.stack
            },
            maxScore: MAX_ASSIGNMENT_SCORE,
            weeks
        });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Get the highest scorer for each of a week's assignments.
const getTopPerformersByWeek = async (req, res, next) => {
    try {
        const week = Number(req.params.week);
        if (!Number.isInteger(week) || week < 1) {
            return next(ApiError.badRequest("Invalid week"));
        }

        // Stack matching is case/space-insensitive, matching the convention the
        // rankings endpoint already uses.
        const normalize = (value) => (value || "").replace(/\s+/g, "").toLowerCase();
        const stackQuery = req.query.stack ? normalize(req.query.stack) : null;

        // "General" assignments are issued to every stack, so they stay in the
        // list even when a stack filter is applied (same rule as getAssignmentsByWeek).
        let assignments = await Assignment.find({ week }).select("title stack");
        if (stackQuery) {
            assignments = assignments.filter(
                (a) => normalize(a.stack) === stackQuery || a.stack === "General"
            );
        }
        if (assignments.length === 0) {
            return res.status(200).json({ week, maxScore: MAX_ASSIGNMENT_SCORE, topPerformers: [] });
        }

        const gradedSubs = await AssignmentSubmission.find({
            assignment: { $in: assignments.map((a) => a._id) },
            status: "Graded"
        }).populate("student", "name image stack");

        // With a stack filter, a General assignment must still be won by someone
        // from the requested stack.
        const eligible = stackQuery
            ? gradedSubs.filter((s) => normalize(s.student?.stack) === stackQuery)
            : gradedSubs;

        const byAssignment = new Map();
        eligible.forEach((sub) => {
            const aid = sub.assignment?.toString();
            if (!aid) return;
            if (!byAssignment.has(aid)) byAssignment.set(aid, []);
            byAssignment.get(aid).push(sub);
        });

        const topPerformers = assignments.map((assignment) => {
            const subs = byAssignment.get(assignment._id.toString()) || [];
            const base = {
                assignmentId: assignment._id,
                title: assignment.title,
                stack: assignment.stack
            };
            if (subs.length === 0) {
                return { ...base, student: null, grade: null, submittedAt: null, tiedCount: 0 };
            }
            const maxGrade = Math.max(...subs.map((s) => s.grade || 0));
            const tied = subs.filter((s) => (s.grade || 0) === maxGrade);
            // Deterministic tie-break — earliest submission, then name — so the
            // winner does not change between page loads.
            tied.sort((a, b) =>
                new Date(a.submittedAt) - new Date(b.submittedAt) ||
                (a.student?.name || "").localeCompare(b.student?.name || "")
            );
            const winner = tied[0];
            return {
                ...base,
                student: winner.student,
                grade: winner.grade,
                submittedAt: winner.submittedAt,
                tiedCount: tied.length
            };
        });

        topPerformers.sort((a, b) => a.title.localeCompare(b.title));

        res.status(200).json({ week, maxScore: MAX_ASSIGNMENT_SCORE, topPerformers });
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
    ,
    // Performance Review
    getStudentPerformanceReview,

    // Weekly Assignment Scores
    getStudentAssignmentScores,

    // Weekly Top Performers
    getTopPerformersByWeek
};