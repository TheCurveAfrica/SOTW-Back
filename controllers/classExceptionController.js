const ClassExceptionRequest = require("../models/ClassExceptionRequest");
const dataModel = require("../models/dataModel");
const User = require("../models/users");
const ApiError = require("../error/ApiError");
const Notification = require("../models/Notification");
const { notifyUsersSafely } = require("../services/notificationService");
const { getProgramSettings, parseDateString, computeCurrentWeek } = require("../utils/programWeek");
const { CLASS_DAYS, cohortNow } = require("../utils/attendance");

// How many exceptions a student may hold across one 24-week program.
//
// This number is enforced here and MUST NOT reach students in any form - not as
// a count, not as a "remaining", not as a distinct error message. That is what
// serializeForStudent and BLOCKED_MESSAGE below exist to guarantee. Tutors see
// it; students never learn there is a limit at all.
const QUOTA = 3;

// Only these consume the allowance, so a declined request costs the student
// nothing and a tutor can decline without locking someone out.
const QUOTA_STATUSES = ["Pending", "Approved"];

const MAX_DATES_PER_REQUEST = 3;

const REASON_CATEGORIES = [
    "Medical",
    "Family emergency",
    "Work / Interview",
    "Travel",
    "Bereavement",
    "Other"
];

// One message for every refusal that involves the allowance, so a student can't
// tell "you are out of tries" apart from anything else by reading the text - or
// by timing the two paths against each other.
const BLOCKED_MESSAGE =
    "We couldn't submit this request. Please speak with your tutor directly about the class you'll be missing.";

const CLASS_DAY_MESSAGE = "Classes only run on Mondays, Wednesdays and Fridays. Please pick a class day.";

// "YYYY-MM-DD" in the cohort's timezone, matching how dataModel.date is written
// by checkIn. Comparing these as strings is safe and sidesteps UTC drift.
const cohortToday = () => cohortNow().format("YYYY-MM-DD");

// The shape students receive. Deliberately hand-built rather than a
// `toObject()` with fields deleted: a new field on the model shows up for
// tutors only until someone adds it here on purpose.
const serializeForStudent = (doc) => ({
    _id: doc._id,
    dates: doc.dates,
    reasonCategory: doc.reasonCategory,
    reason: doc.reason,
    catchUpPlan: doc.catchUpPlan,
    impactAcknowledged: doc.impactAcknowledged,
    status: doc.status,
    reviewNote: doc.reviewNote,
    reviewedAt: doc.reviewedAt,
    weekAtRequest: doc.weekAtRequest,
    createdAt: doc.createdAt
});

// Everything above, plus who asked and where they stand against the allowance.
const serializeForTutor = (doc, quotaUsed) => ({
    ...serializeForStudent(doc),
    student: doc.student && doc.student._id
        ? {
            _id: doc.student._id,
            name: doc.student.name,
            image: doc.student.image,
            stack: doc.student.stack,
            email: doc.student.email
        }
        : doc.student,
    quotaUsed,
    quotaRemaining: Math.max(QUOTA - quotaUsed, 0),
    quotaLimit: QUOTA
});

// Validate the requested dates: real calendar days, class days, not in the
// past, no duplicates, and no more than the per-request cap.
const validateDates = (dates) => {
    if (!Array.isArray(dates) || dates.length === 0) {
        return { error: "Please select at least one class day." };
    }

    if (dates.length > MAX_DATES_PER_REQUEST) {
        return { error: `You can request at most ${MAX_DATES_PER_REQUEST} class days at a time.` };
    }

    const unique = [...new Set(dates)];
    if (unique.length !== dates.length) {
        return { error: "The same date was selected more than once." };
    }

    const today = cohortToday();

    for (const value of unique) {
        // parseDateString enforces the YYYY-MM-DD shape and rejects impossible
        // dates like 2026-02-31, which `new Date` would silently roll over.
        const parsed = parseDateString(value);
        if (!parsed) return { error: `"${value}" is not a valid date.` };

        if (!CLASS_DAYS.includes(parsed.getDay())) return { error: CLASS_DAY_MESSAGE };

        if (value < today) return { error: "You can only request an exception for an upcoming class day." };
    }

    return { dates: unique.sort() };
};

// ============== STUDENT ==============

const createExceptionRequest = async (req, res, next) => {
    try {
        const studentId = req.user?.id;
        if (!studentId) return next(ApiError.badRequest("Missing user"));

        // req.user is the decoded JWT, so role is re-checked against the record
        // - the same guard submitAssignment uses.
        const student = await User.findById(studentId);
        if (!student) return next(ApiError.notFound("User not found"));
        if (student.role !== "student") {
            return next(ApiError.badRequest("Only students can request a class exception"));
        }

        const { dates, reasonCategory, reason, catchUpPlan, impactAcknowledged } = req.body;

        if (!REASON_CATEGORIES.includes(reasonCategory)) {
            return next(ApiError.badRequest("Please choose a reason for missing class."));
        }

        const trimmedReason = typeof reason === "string" ? reason.trim() : "";
        if (!trimmedReason) {
            return next(ApiError.badRequest("Please tell your tutors why you'll be missing class."));
        }

        const validated = validateDates(dates);
        if (validated.error) return next(ApiError.badRequest(validated.error));

        const settings = await getProgramSettings();
        const programStartDate = settings.startDate ?? null;

        // A date already spoken for is a plain duplicate, not an allowance
        // problem, so it gets its own message.
        const overlapping = await ClassExceptionRequest.findOne({
            student: studentId,
            status: { $in: QUOTA_STATUSES },
            dates: { $in: validated.dates }
        });
        if (overlapping) {
            return next(ApiError.badRequest("You already have a request covering one of those class days."));
        }

        const quotaFilter = {
            student: studentId,
            programStartDate,
            status: { $in: QUOTA_STATUSES }
        };

        if (await ClassExceptionRequest.countDocuments(quotaFilter) >= QUOTA) {
            await notifyTutorsOfBlockedAttempt(student);
            return next(ApiError.badRequest(BLOCKED_MESSAGE));
        }

        const request = await ClassExceptionRequest.create({
            student: studentId,
            dates: validated.dates,
            reasonCategory,
            reason: trimmedReason,
            catchUpPlan: typeof catchUpPlan === "string" ? catchUpPlan.trim() : undefined,
            impactAcknowledged: Boolean(impactAcknowledged),
            programStartDate,
            weekAtRequest: computeCurrentWeek(settings)
        });

        // Compare-and-rollback. There are no transactions here, so two requests
        // fired at once can both clear the count above; re-counting after the
        // write and dropping whatever went over keeps the allowance exact.
        if (await ClassExceptionRequest.countDocuments(quotaFilter) > QUOTA) {
            await ClassExceptionRequest.deleteOne({ _id: request._id });
            await notifyTutorsOfBlockedAttempt(student);
            return next(ApiError.badRequest(BLOCKED_MESSAGE));
        }

        await notifyTutorsOfRequest(request, student);

        res.status(201).json({
            message: "Your request has been sent to your tutors",
            request: serializeForStudent(request)
        });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

const getMyExceptionRequests = async (req, res, next) => {
    try {
        const requests = await ClassExceptionRequest.find({ student: req.user?.id })
            .sort({ createdAt: -1 });

        res.status(200).json({ requests: requests.map(serializeForStudent) });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// ============== TUTOR ==============

const getExceptionRequests = async (req, res, next) => {
    try {
        const { status, stack } = req.query;

        const filter = {};
        if (status) {
            if (!["Pending", "Approved", "Declined"].includes(status)) {
                return next(ApiError.badRequest("Invalid status filter"));
            }
            filter.status = status;
        }

        const settings = await getProgramSettings();

        const requests = await ClassExceptionRequest.find(filter)
            .populate("student", "name image stack email role")
            .populate("reviewedBy", "name")
            .sort({ createdAt: -1 });

        // User.stack is stored lowercase while the rest of the platform uses
        // Title Case, and neither has a schema enum - so stack filtering is a
        // normalized in-memory comparison, never a Mongo query.
        const normalize = (value) => value?.toLowerCase().replace(/\s+/g, "") ?? "";
        const visible = stack
            ? requests.filter((request) => normalize(request.student?.stack) === normalize(stack))
            : requests;

        // One grouped count for everyone on screen rather than a query per row.
        const quotaUsed = await quotaUsedByStudent(
            visible.map((request) => request.student?._id),
            settings.startDate ?? null
        );

        // Pending first, then newest - the review queue reads top-down.
        const ordered = [...visible].sort((a, b) => {
            if (a.status === "Pending" && b.status !== "Pending") return -1;
            if (b.status === "Pending" && a.status !== "Pending") return 1;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        res.status(200).json({
            requests: ordered.map((request) =>
                serializeForTutor(request, quotaUsed.get(String(request.student?._id)) || 0))
        });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

const reviewExceptionRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, reviewNote } = req.body;

        if (!["Approved", "Declined"].includes(status)) {
            return next(ApiError.badRequest("Status must be either Approved or Declined"));
        }

        const request = await ClassExceptionRequest.findById(id).populate("student", "name image email stack");
        if (!request) return next(ApiError.notFound("Request not found"));
        if (request.status !== "Pending") {
            return next(ApiError.badRequest(`This request has already been ${request.status.toLowerCase()}`));
        }

        request.status = status;
        request.reviewedBy = req.user?.id;
        request.reviewedAt = new Date();
        request.reviewNote = typeof reviewNote === "string" ? reviewNote.trim() : undefined;
        await request.save();

        if (status === "Approved") await writeExcusedAttendance(request);

        await notifyStudentOfReview(request);

        const settings = await getProgramSettings();

        res.status(200).json({
            message: `Request ${status.toLowerCase()}`,
            request: serializeForTutor(
                request,
                await quotaUsedFor(request.student?._id, settings.startDate ?? null)
            )
        });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// ============== HELPERS ==============

// How many requests each of these students currently has against the allowance,
// as a Map keyed by stringified id. One aggregation for the whole page.
//
// Scoped to programStartDate for the same reason the enforcement check is: the
// number a tutor reads has to be the number that will actually block a student.
const quotaUsedByStudent = async (studentIds, programStartDate) => {
    const ids = studentIds.filter(Boolean);
    if (!ids.length) return new Map();

    const rows = await ClassExceptionRequest.aggregate([
        {
            $match: {
                student: { $in: ids },
                programStartDate: programStartDate ?? null,
                status: { $in: QUOTA_STATUSES }
            }
        },
        { $group: { _id: "$student", count: { $sum: 1 } } }
    ]);

    return new Map(rows.map((row) => [String(row._id), row.count]));
};

const quotaUsedFor = async (studentId, programStartDate) => {
    if (!studentId) return 0;
    return ClassExceptionRequest.countDocuments({
        student: studentId,
        programStartDate: programStartDate ?? null,
        status: { $in: QUOTA_STATUSES }
    });
};

// Mark each approved date excused in the attendance collection.
//
// Written as check-then-create rather than an upsert so the record goes through
// the model constructor, which casts the scalar id into dataModel's `userId`
// array exactly the way checkIn does. An existing record always wins: a student
// who ends up attending keeps the score they earned.
const writeExcusedAttendance = async (request) => {
    const studentId = request.student?._id || request.student;

    for (const date of request.dates) {
        const existing = await dataModel.findOne({ userId: studentId, date });
        if (existing) continue;

        await dataModel.create({
            userId: studentId,
            date,
            status: "excused",
            punctualityScore: 0,
            location: "Excused absence"
        });
    }
};

const notifyTutorsOfRequest = async (request, student) => {
    const tutors = await User.find({ role: { $in: ["tutor", "admin"] } }).select("_id name email");
    if (!tutors.length) return;

    const dateSummary = request.dates.join(", ");

    await notifyUsersSafely({
        users: tutors,
        type: "exception_requested",
        title: "Class exception request",
        body: `${student.name} asked to be excused from class on ${dateSummary}.`,
        link: "/checkin",
        data: { exceptionRequest: request._id },
        email: {
            subject: `Class exception request from ${student.name}`,
            payload: (tutor) => ({
                tutorName: tutor.name,
                studentName: student.name,
                stack: student.stack,
                dates: request.dates,
                reasonCategory: request.reasonCategory,
                reason: request.reason
            })
        }
    });
};

// Let tutors know a student is out of exceptions and still trying, so someone
// can follow up on whatever is going on.
//
// In-app only, and at most one a day per student: this fires on a path the
// student can retry at will, so emailing every tutor on every attempt would
// hand them a way to flood the staff's inboxes.
const BLOCKED_NOTICE_WINDOW_MS = 24 * 60 * 60 * 1000;

const notifyTutorsOfBlockedAttempt = async (student) => {
    try {
        const alreadyNotified = await Notification.exists({
            type: "exception_blocked",
            "data.blockedStudent": student._id,
            createdAt: { $gt: new Date(Date.now() - BLOCKED_NOTICE_WINDOW_MS) }
        });
        if (alreadyNotified) return;

        const tutors = await User.find({ role: { $in: ["tutor", "admin"] } }).select("_id name");
        if (!tutors.length) return;

        await notifyUsersSafely({
            users: tutors,
            type: "exception_blocked",
            title: "Exception request blocked",
            body: `${student.name} tried to request another class exception but has already used their allowance.`,
            link: "/checkin",
            data: { blockedStudent: student._id }
            // No `email` key: in-app only.
        });
    } catch (err) {
        console.error("Failed to notify tutors of blocked attempt:", err.message);
    }
};

const notifyStudentOfReview = async (request) => {
    const student = request.student;
    if (!student?._id) return;

    await notifyUsersSafely({
        users: [student],
        type: "exception_reviewed",
        title: `Class exception ${request.status.toLowerCase()}`,
        body: request.status === "Approved"
            ? `Your request to miss class on ${request.dates.join(", ")} was approved.`
            : `Your request to miss class on ${request.dates.join(", ")} was declined.`,
        link: "/checkin",
        data: { exceptionRequest: request._id },
        email: {
            subject: `Your class exception request was ${request.status.toLowerCase()}`,
            payload: {
                studentName: student.name,
                status: request.status,
                dates: request.dates,
                reviewNote: request.reviewNote
            }
        }
    });
};

module.exports = {
    createExceptionRequest,
    getMyExceptionRequests,
    getExceptionRequests,
    reviewExceptionRequest
};
