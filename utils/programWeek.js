const ProgramSettings = require("../models/ProgramSettings");

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Read the singleton settings document, creating it with the schema defaults on
// first access so a fresh database needs no seeding.
const getProgramSettings = async () => {
    return ProgramSettings.findOneAndUpdate(
        { key: "program" },
        { $setOnInsert: {} },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
};

// Parse a "YYYY-MM-DD" string into a local-time Date at midnight. Deliberately
// avoids `new Date(str)`, which would treat the string as UTC.
const parseDateString = (value) => {
    if (!value || !DATE_PATTERN.test(value)) return null;

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    // Rejects impossible dates like "2026-02-31", which Date would roll over.
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
    }

    return date;
};

// Monday 00:00 of the calendar week containing `date`.
const mondayOf = (date) => {
    const monday = new Date(date);
    monday.setHours(0, 0, 0, 0);
    // getDay() is 0=Sunday..6=Saturday, so Sunday belongs to the week that started six days ago.
    const daysSinceMonday = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - daysSinceMonday);
    return monday;
};

// The week the cohort is currently in: a manual pin if one is set, otherwise
// derived from the start date. Falls back to week 1 when nothing is configured.
const computeCurrentWeek = (settings) => {
    const totalWeeks = settings?.totalWeeks || 24;

    if (settings?.weekOverride) {
        return Math.min(Math.max(settings.weekOverride, 1), totalWeeks);
    }

    const start = parseDateString(settings?.startDate);
    if (!start) return 1;

    const weeksElapsed = Math.floor((mondayOf(new Date()) - mondayOf(start)) / (7 * MS_PER_DAY));
    return Math.min(Math.max(weeksElapsed + 1, 1), totalWeeks);
};

// Monday 00:00 of program week N. Without a configured start date this falls
// back to the current calendar week, preserving the behaviour deployments had
// before program settings existed.
const getWeekStart = (settings, weekNumber) => {
    const anchor = parseDateString(settings?.startDate) || new Date();
    const weekStart = mondayOf(anchor);
    weekStart.setDate(weekStart.getDate() + 7 * (Number(weekNumber) - 1));
    return weekStart;
};

// The shape sent to clients: the stored fields plus the resolved current week.
const serializeProgramSettings = (settings) => ({
    startDate: settings.startDate ?? null,
    weekOverride: settings.weekOverride ?? null,
    totalWeeks: settings.totalWeeks,
    currentWeek: computeCurrentWeek(settings)
});

module.exports = {
    getProgramSettings,
    parseDateString,
    mondayOf,
    computeCurrentWeek,
    getWeekStart,
    serializeProgramSettings
};
