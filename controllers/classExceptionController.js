const ClassExceptionRequest = require("../models/ClassExceptionRequest");
const dataModel = require("../models/dataModel");
const User = require("../models/users");
const ApiError = require("../error/ApiError");
const { notifyUsersSafely } = require("../services/notificationService");
const { getProgramSettings, parseDateString, computeCurrentWeek } = require("../utils/programWeek");
const { cohortNow } = require("../utils/attendance");

// How many exception days a student gets across one 24-week program.
//
// Students see this number and what they have left - it is returned as the
// `allowance` envelope on their own endpoints. Running out is not a wall: an
// out-of-days student can still file emergency requests (isEmergency below),
// which sit outside the allowance and are still subject to approval.
const QUOTA = 3;

// Only these consume the allowance, so a declined request costs the student
// nothing and a tutor can decline without locking someone out.
const QUOTA_STATUSES = ["Pending", "Approved"];

// Days an exception may be requested for: the three class days plus Saturday,
// which carries extra-curricular events.
//
// Deliberately NOT CLASS_DAYS from utils/attendance.js. That constant drives
// check-in and punctuality scoring, and adding Saturday to it would let students
// check in at weekends and change how attendance is scored.
const EXCEPTION_DAYS = [1, 3, 5, 6]; // Mon, Wed, Fri, Sat

const REASON_CATEGORIES = [
    "Medical",
    "Family emergency",
    "Work / Interview",
    "Travel",
    "Bereavement",
    "Extra-curricular event",
    "Other"
];

const EXCEPTION_DAY_MESSAGE =
    "Exceptions can only be requested for Mondays, Wednesdays, Fridays or Saturdays.";

// "YYYY-MM-DD" in the cohort's timezone, matching how dataModel.date is written
// by checkIn. Comparing these as strings is safe and sidesteps UTC drift.
const cohortToday = () => cohortNow().format("YYYY-MM-DD");

// Where a student stands. Returned alongside their requests rather than on each
// one, because it describes the student, not any single request.
const buildAllowance = (used) => ({
    used: Math.min(used, QUOTA),
    remaining: Math.max(QUOTA - used, 0),
    limit: QUOTA,
    emergencyOnly: used >= QUOTA
});

// The shape students receive. Hand-built rather than a `toObject()` so the
// fields leaving the server are a deliberate choice: a new field on the model
// stays internal until someone adds it here on purpose.
const serializeForStudent = (doc) => ({
    _id: doc._id,
    date: doc.date,
    isEmergency: Boolean(doc.isEmergency),
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

// Validate the requested day: a real calendar date, an eligible weekday, and
// not in the past.
const validateDate = (value) => {
    if (typeof value !== "string" || !value) {
        return { error: "Please select the class day you'll be missing." };
    }

    // parseDateString enforces the YYYY-MM-DD shape and rejects impossible
    // dates like 2026-02-31, which `new Date` would silently roll over.
    const parsed = parseDateString(value);
    if (!parsed) return { error: `"${value}" is not a valid date.` };

    if (!EXCEPTION_DAYS.includes(parsed.getDay())) return { error: EXCEPTION_DAY_MESSAGE };

    if (value < cohortToday()) {
        return { error: "You can only request an exception for an upcoming day." };
    }

    return { date: value };
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

        const { date, reasonCategory, reason, catchUpPlan, impactAcknowledged } = req.body;
        const isEmergency = req.body.isEmergency === true;

        if (!REASON_CATEGORIES.includes(reasonCategory)) {
            return next(ApiError.badRequest("Please choose a reason for missing class."));
        }

        const trimmedReason = typeof reason === "string" ? reason.trim() : "";
        if (!trimmedReason) {
            return next(ApiError.badRequest(isEmergency
                ? "Please tell your tutors what the emergency is."
                : "Please tell your tutors why you'll be missing class."));
        }

        const validated = validateDate(date);
        if (validated.error) return next(ApiError.badRequest(validated.error));

        const settings = await getProgramSettings();
        const programStartDate = settings.startDate ?? null;

        // A day already spoken for is a plain duplicate, not an allowance
        // problem, so it gets its own message.
        const overlapping = await ClassExceptionRequest.findOne({
            student: studentId,
            status: { $in: QUOTA_STATUSES },
            date: validated.date
        });
        if (overlapping) {
            return next(ApiError.badRequest("You already have a request for that day."));
        }

        // Emergencies are excluded: they only exist once the allowance is gone,
        // so counting them would push `used` past the limit. $ne rather than
        // false so a document written before the field existed still counts.
        const quotaFilter = {
            student: studentId,
            programStartDate,
            status: { $in: QUOTA_STATUSES },
            isEmergency: { $ne: true }
        };

        const used = await ClassExceptionRequest.countDocuments(quotaFilter);
        const allowance = buildAllowance(used);

        if (isEmergency && !allowance.emergencyOnly) {
            return next(ApiError.badRequest(
                `You still have ${allowance.remaining} exception day${allowance.remaining === 1 ? "" : "s"} left — please use a normal request.`
            ));
        }

        if (!isEmergency && allowance.emergencyOnly) {
            return next(ApiError.badRequest(
                `You've used all ${QUOTA} of your exception days. If this is an emergency, submit it as an emergency request.`
            ));
        }

        // One pending emergency at a time. Without this an out-of-days student
        // could queue up a backlog that lands on every tutor at once.
        if (isEmergency) {
            const pendingEmergency = await ClassExceptionRequest.findOne({
                student: studentId,
                isEmergency: true,
                status: "Pending"
            });
            if (pendingEmergency) {
                return next(ApiError.badRequest(
                    "You already have an emergency request awaiting review. Your tutors will respond to that one first."
                ));
            }
        }

        const request = await ClassExceptionRequest.create({
            student: studentId,
            date: validated.date,
            isEmergency,
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
        // Emergencies are outside the allowance, so they are not re-counted.
        if (!isEmergency && await ClassExceptionRequest.countDocuments(quotaFilter) > QUOTA) {
            await ClassExceptionRequest.deleteOne({ _id: request._id });
            return next(ApiError.badRequest(
                `You've used all ${QUOTA} of your exception days. If this is an emergency, submit it as an emergency request.`
            ));
        }

        await notifyTutorsOfRequest(request, student);

        res.status(201).json({
            message: isEmergency
                ? "Your emergency request has been sent to your tutors"
                : "Your request has been sent to your tutors",
            request: serializeForStudent(request),
            allowance: buildAllowance(isEmergency ? used : used + 1)
        });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

const getMyExceptionRequests = async (req, res, next) => {
    try {
        const studentId = req.user?.id;
        const settings = await getProgramSettings();

        const [requests, used] = await Promise.all([
            ClassExceptionRequest.find({ student: studentId }).sort({ createdAt: -1 }),
            quotaUsedFor(studentId, settings.startDate ?? null)
        ]);

        res.status(200).json({
            requests: requests.map(serializeForStudent),
            // Sent on the list endpoint too, so the counter renders on page load
            // rather than only after a request has been made.
            allowance: buildAllowance(used)
        });
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

        // Pending first, emergencies at the very top, then newest - a tutor
        // opening the queue should land on the thing that cannot wait.
        const rank = (request) => {
            if (request.status !== "Pending") return 2;
            return request.isEmergency ? 0 : 1;
        };

        const ordered = [...visible].sort((a, b) => {
            const byRank = rank(a) - rank(b);
            if (byRank !== 0) return byRank;
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
                status: { $in: QUOTA_STATUSES },
                isEmergency: { $ne: true }
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
        status: { $in: QUOTA_STATUSES },
        isEmergency: { $ne: true }
    });
};

// Mark the approved day excused in the attendance collection.
//
// Written as check-then-create rather than an upsert so the record goes through
// the model constructor, which casts the scalar id into dataModel's `userId`
// array exactly the way checkIn does. An existing record always wins: a student
// who ends up attending keeps the score they earned.
//
// An approved Saturday writes a row for a day that was never scored, which is
// harmless (every average skips excused rows) and useful: the day then reads as
// Excused in attendance history instead of simply not existing.
const writeExcusedAttendance = async (request) => {
    const studentId = request.student?._id || request.student;

    const existing = await dataModel.findOne({ userId: studentId, date: request.date });
    if (existing) return;

    await dataModel.create({
        userId: studentId,
        date: request.date,
        status: "excused",
        punctualityScore: 0,
        location: "Excused absence"
    });
};

const notifyTutorsOfRequest = async (request, student) => {
    const tutors = await User.find({ role: { $in: ["tutor", "admin"] } }).select("_id name email");
    if (!tutors.length) return;

    // Emergencies are announced louder: they only reach a tutor after a student
    // has run out of ordinary days, so they should stand out in a full inbox.
    const prefix = request.isEmergency ? "EMERGENCY: " : "";

    await notifyUsersSafely({
        users: tutors,
        type: "exception_requested",
        title: `${prefix}Class exception request`,
        body: request.isEmergency
            ? `${student.name} filed an emergency request to be excused on ${request.date}.`
            : `${student.name} asked to be excused from class on ${request.date}.`,
        link: "/checkin",
        data: { exceptionRequest: request._id },
        email: {
            subject: `${prefix}Class exception request from ${student.name}`,
            payload: (tutor) => ({
                tutorName: tutor.name,
                studentName: student.name,
                stack: student.stack,
                date: request.date,
                isEmergency: request.isEmergency,
                reasonCategory: request.reasonCategory,
                reason: request.reason
            })
        }
    });
};

const notifyStudentOfReview = async (request) => {
    const student = request.student;
    if (!student?._id) return;

    await notifyUsersSafely({
        users: [student],
        type: "exception_reviewed",
        title: `Class exception ${request.status.toLowerCase()}`,
        body: request.status === "Approved"
            ? `Your request to miss class on ${request.date} was approved.`
            : `Your request to miss class on ${request.date} was declined.`,
        link: "/checkin",
        data: { exceptionRequest: request._id },
        email: {
            subject: `Your class exception request was ${request.status.toLowerCase()}`,
            payload: {
                studentName: student.name,
                status: request.status,
                date: request.date,
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
