const users = require("../models/users");
const ratings = require("../models/ratings");
const backendSOTW = require("../models/BSOW");
const productSOTW = require("../models/PSOW");
const frontendSOTW = require("../models/SOW");
const ApiError = require("../error/ApiError");

// User documents store `stack` lowercase ("frontend", "product design") because
// that is what the signup validator allows, while Assignment documents use the
// Title Case form ("Front End"). Neither field carries a schema enum, so every
// stack comparison normalizes both sides — the same helper users.js and
// assignmentManagementController.js already use.
const normalizeStack = (stack) => (stack || "").toLowerCase().replace(/\s+/g, "");

const FRONT_END = "frontend";
const BACK_END = "backend";
const PRODUCT_DESIGN = "productdesign";

// Display label and winner model for each stack, keyed by its normalized value.
const STACKS = {
    [FRONT_END]: { label: "Front End", model: frontendSOTW },
    [BACK_END]: { label: "Back End", model: backendSOTW },
    [PRODUCT_DESIGN]: { label: "Product Design", model: productSOTW },
};

// `role` is a bare String on the user schema too, so it gets the same treatment.
const isStudentIn = (student, normalizedStack) =>
    normalizeStack(student?.stack) === normalizedStack &&
    normalizeStack(student?.role) === "student";

const parseWeek = (value) => {
    const week = Number(value);
    return Number.isInteger(week) && week >= 1 ? week : null;
};

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * Break a tie on the top weekly score by biggest week-on-week improvement,
 * falling back to a random pick among the tied students.
 *
 * Improvement only exists from week 2 onward, and only for students with at
 * least two recorded ratings — anyone else stays in the running via the
 * random fallback rather than being dropped.
 */
async function breakTie(topScorers, week) {
    if (week < 2) {
        return pickRandom(topScorers);
    }

    let maxImprovement = -Infinity;
    let mostImproved = [];

    for (const rating of topScorers) {
        const allRatings = rating.student?.allRatings;
        if (!allRatings || allRatings.length < 2) continue;

        // The last two entries are [previous, latest].
        const [previous, latest] = await Promise.all(
            allRatings.slice(-2).map(async (ratingId) => {
                const found = await ratings.findById(ratingId).lean().exec();
                return found ? found.total : 0;
            })
        );

        if (latest <= previous) continue;

        const improvement = latest - previous;
        if (improvement > maxImprovement) {
            maxImprovement = improvement;
            mostImproved = [rating];
        } else if (improvement === maxImprovement) {
            mostImproved.push(rating);
        }
    }

    return pickRandom(mostImproved.length ? mostImproved : topScorers);
}

/**
 * Shared implementation behind the three per-stack Student of the Week routes.
 *
 * Ranks a stack's students on their weekly `ratings.total`, so the week's
 * ratings must already be entered. A stack that already has a winner for the
 * week cannot be picked again.
 */
async function chooseSOTW(normalizedStack, req, res, next) {
    try {
        const { label, model } = STACKS[normalizedStack];

        const week = parseWeek(req.body.week);
        if (week === null) {
            return res.status(400).json({ message: "A valid week is required" });
        }

        const existing = await model.find().where("week").equals(week);
        if (existing.length !== 0) {
            return res.status(400).json({ message: `There is a SOTW for week: ${week} already` });
        }

        const resultsForWeek = await ratings.find().where("week").equals(week).populate("student");
        if (resultsForWeek.length === 0) {
            return res.status(400).json({
                message: `No weekly ratings have been entered for week ${week} yet`,
            });
        }

        // Distinct from the check above: ratings exist for the week, just none
        // belonging to a student in this stack.
        const candidates = resultsForWeek.filter((result) => isStudentIn(result?.student, normalizedStack));
        if (candidates.length === 0) {
            return res.status(400).json({
                message: `No rated students in the ${label} stack for week ${week}`,
            });
        }

        const highestScore = Math.max(...candidates.map((rating) => rating.total));
        const topScorers = candidates.filter((result) => result.total === highestScore);

        const winner = topScorers.length === 1 ? topScorers[0] : await breakTie(topScorers, week);

        await model.create({ week, student: winner.student._id });
        return res.status(200).json({ data: "Student Added" });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
}

const theAlgorithm = {
    "chooseFrontEndSOTW": function(req, res, next){
        return chooseSOTW(FRONT_END, req, res, next);
    },
    "chooseBackEndSOTW": function(req, res, next){
        return chooseSOTW(BACK_END, req, res, next);
    },
    "chooseProductSOTW": function(req, res, next){
        return chooseSOTW(PRODUCT_DESIGN, req, res, next);
    },
    "chooseStudentsOfTheMonth": async function(req, res, next){
        try{
            const week = parseWeek(req.body.week);
            if (week === null) {
                return res.status(400).json({ message: "A valid week is required" });
            }

            // Mongo cannot normalize the stored stack on its own, so fetch every
            // student once and partition in memory — the same approach
            // getRankingsAndTopAssignments uses in users.js.
            const allStudents = await users.find({ role: "student" }).select("name _id stack");

            const averageOfLastFour = async (studentId) => {
                const lastFour = await ratings.find({ student: studentId }).sort({ week: -1 }).limit(4);
                if (lastFour.length === 0) return 0;
                return lastFour.reduce((sum, rating) => sum + rating.total, 0) / lastFour.length;
            };

            // Returns null for a stack with no students rather than throwing.
            const topOfStack = async (normalizedStack) => {
                const inStack = allStudents.filter((student) => normalizeStack(student.stack) === normalizedStack);
                const scored = await Promise.all(inStack.map(async (student) => ({
                    id: student._id,
                    name: student.name,
                    average: await averageOfLastFour(student._id),
                })));
                return scored.reduce(
                    (best, entry) => (best === null || entry.average > best.average ? entry : best),
                    null
                );
            };

            const [front, back, product] = await Promise.all([
                topOfStack(FRONT_END),
                topOfStack(BACK_END),
                topOfStack(PRODUCT_DESIGN),
            ]);

            const winners = [
                { winner: front, model: frontendSOTW },
                { winner: back, model: backendSOTW },
                { winner: product, model: productSOTW },
            ].filter((entry) => entry.winner !== null);

            if (winners.length === 0) {
                return res.status(400).json({ message: "There are no students to rank for the month" });
            }

            // These are written over the given week's Student of the Week records,
            // replacing whatever the dashboard shows for that week.
            await Promise.all(winners.map((entry) => entry.model.create({ week, student: entry.winner.id })));

            res.status(200).json({ front, back, product })
        }catch(err){
            next(ApiError.badRequest(`${err}`))
        }
    },
    "setStudentsPosition": async function(req, res, next){
        try{
            const students = await users.find({ role: "student" }).select("_id stack overallRating");

            const updates = [];
            for (const normalizedStack of Object.keys(STACKS)) {
                const ranked = students
                    .filter((student) => normalizeStack(student.stack) === normalizedStack)
                    .sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0));

                ranked.forEach((student, index) => {
                    updates.push({
                        updateOne: {
                            filter: { _id: student._id },
                            update: { $set: { position: index + 1 } }, // Position starts from 1
                        },
                    });
                });
            }

            // bulkWrite rather than a save() per document: these are long-lived
            // records and a full-document validation pass would reject any that
            // predate a currently-required field.
            if (updates.length > 0) {
                await users.bulkWrite(updates);
            }

            res.status(200).json({
                message: "Student positions updated successfully for all stacks",
                updated: updates.length,
            });
        }catch(err){
            next(ApiError.badRequest(`${err}`))
        }
    }

}

module.exports = theAlgorithm;
