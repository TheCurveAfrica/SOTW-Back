const ApiError = require("../error/ApiError");
const {
    getProgramSettings: loadProgramSettings,
    serializeProgramSettings,
    parseDateString
} = require("../utils/programWeek");

const MAX_TOTAL_WEEKS = 52;

// ============== PROGRAM SETTINGS ==============

// Get the program settings (any authenticated user — every client needs the
// current week to default its week pickers).
const getProgramSettings = async (req, res, next) => {
    try {
        const settings = await loadProgramSettings();

        res.status(200).json({ settings: serializeProgramSettings(settings) });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

// Update the program settings (tutors and admins). Every field is optional so
// the client can send just the one it changed.
const updateProgramSettings = async (req, res, next) => {
    try {
        const { startDate, weekOverride, totalWeeks } = req.body;
        const settings = await loadProgramSettings();

        if (totalWeeks !== undefined) {
            const parsed = Number(totalWeeks);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TOTAL_WEEKS) {
                return next(ApiError.badRequest(`Total weeks must be a whole number between 1 and ${MAX_TOTAL_WEEKS}`));
            }
            settings.totalWeeks = parsed;
        }

        if (startDate !== undefined) {
            if (startDate === null || startDate === "") {
                settings.startDate = null;
            } else if (typeof startDate !== "string" || !parseDateString(startDate)) {
                // parseDateString also rejects shape-valid but impossible dates
                // like "2026-02-31", which would otherwise be stored and then
                // silently resolve to week 1.
                return next(ApiError.badRequest("Start date must be a real date in YYYY-MM-DD format"));
            } else {
                settings.startDate = startDate;
            }
        }

        if (weekOverride !== undefined) {
            if (weekOverride === null || weekOverride === "") {
                settings.weekOverride = null;
            } else {
                const parsed = Number(weekOverride);
                // Checked against the incoming totalWeeks, which is already applied above.
                if (!Number.isInteger(parsed) || parsed < 1 || parsed > settings.totalWeeks) {
                    return next(ApiError.badRequest(`Week must be a whole number between 1 and ${settings.totalWeeks}`));
                }
                settings.weekOverride = parsed;
            }
        }

        settings.updatedBy = req.user?.id || null;
        await settings.save();

        res.status(200).json({
            message: "Program settings updated successfully",
            settings: serializeProgramSettings(settings)
        });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
};

module.exports = {
    getProgramSettings,
    updateProgramSettings
};
