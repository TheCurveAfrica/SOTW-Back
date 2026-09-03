const moment = require("moment-timezone");

// The cohort runs on West Africa Time while the server runs UTC (Vercel sets
// TZ=UTC, see vercel.json), so every decision about a cohort wall-clock time
// names its zone rather than trusting the host clock. This module is the single
// place that clock is defined; utils/attendance.js re-exports from here.
const COHORT_TIMEZONE = "Africa/Lagos";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

// The single clock every cohort decision derives from.
const cohortNow = () => moment().tz(COHORT_TIMEZONE);

// Combine the naive "YYYY-MM-DD" + "HH:mm" a tutor typed into the instant that
// wall clock names in the cohort's zone. Returns null on anything malformed:
// the previous `new Date(y, m - 1, d, h, min)` produced an Invalid Date, which
// slipped past the callers' `>=` guards (NaN comparisons are always false) and
// only failed later as a raw Mongoose cast error.
const parseCohortDateTime = (dateStr, timeStr) => {
    if (!DATE_PATTERN.test(String(dateStr)) || !TIME_PATTERN.test(String(timeStr))) {
        return null;
    }

    const parsed = moment.tz(`${dateStr} ${timeStr}`, "YYYY-MM-DD HH:mm", true, COHORT_TIMEZONE);
    return parsed.isValid() ? parsed.toDate() : null;
};

// Split a stored instant back into the cohort wall clock it represents, in the
// shape the API accepts back ({ dueDate: "YYYY-MM-DD", dueTime: "HH:mm" }).
// The inverse of parseCohortDateTime.
const splitCohortDateTime = (date) => {
    const m = moment(date).tz(COHORT_TIMEZONE);
    if (!m.isValid()) return null;

    return { dueDate: m.format("YYYY-MM-DD"), dueTime: m.format("HH:mm") };
};

// Cohort midnight on the calendar day `date` names in the *host* zone, offset by
// `days`. The caller is utils/programWeek, which builds its Mondays with
// host-local setters (setHours/setDate) - so host-local getters are what recover
// the calendar day it meant, on any host. Re-deriving the day from the instant
// instead would shift it by one on a host far enough east of the cohort.
const cohortMidnightFromLocalDate = (date, days = 0) =>
    moment
        .tz(
            { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() },
            COHORT_TIMEZONE
        )
        .add(days, "days")
        .toDate();

// "10th September 2026 at 2:00 am", rendered in the cohort's zone.
const formatCohortDateTime = (date) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: COHORT_TIMEZONE,
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    }).formatToParts(date);

    const formatted = parts.map((part) => part.value).join("");

    // The day has to come from the same formatted parts, not from
    // date.getDate(): that getter reads the host zone, so on a UTC server it
    // would stamp the wrong ordinal over the day Intl just printed.
    const day = Number(parts.find((part) => part.type === "day").value);
    let suffix = "th";
    if (day % 10 === 1 && day !== 11) suffix = "st";
    else if (day % 10 === 2 && day !== 12) suffix = "nd";
    else if (day % 10 === 3 && day !== 13) suffix = "rd";

    return formatted.replace(/^\d+/, `${day}${suffix}`);
};

module.exports = {
    COHORT_TIMEZONE,
    cohortNow,
    parseCohortDateTime,
    splitCohortDateTime,
    cohortMidnightFromLocalDate,
    formatCohortDateTime
};
