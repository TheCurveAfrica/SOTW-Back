// The cohort clock lives in utils/cohortTime.js so assignments and attendance
// share one definition of "now" and one timezone. Re-exported here because
// attendance callers have always imported it from this module.
const { COHORT_TIMEZONE, cohortNow } = require("./cohortTime");

// Class days as moment/Date weekday numbers (0 = Sunday).
const CLASS_DAYS = [1, 3, 5]; // Mon, Wed, Fri

const ON_TIME_CUTOFF = "09:45:00"; // at or before -> full marks
const LATE_CUTOFF = "10:00:00";    // at or before -> partial marks

const ON_TIME_SCORE = 20;
const LATE_SCORE = 10;
const ABSENT_SCORE = 0;

const isClassDay = (m) => CLASS_DAYS.includes(m.day());

// Score a "HH:mm:ss" string. The bands are contiguous - every second of the day
// lands in exactly one - which the previous chained comparisons were not:
// 09:45:01-09:45:59 matched no branch and fell through to 0.
const punctualityScoreFor = (time) => {
    if (time <= ON_TIME_CUTOFF) return ON_TIME_SCORE;
    if (time <= LATE_CUTOFF) return LATE_SCORE;
    return ABSENT_SCORE;
};

module.exports = {
    COHORT_TIMEZONE,
    CLASS_DAYS,
    ON_TIME_CUTOFF,
    LATE_CUTOFF,
    ON_TIME_SCORE,
    LATE_SCORE,
    ABSENT_SCORE,
    cohortNow,
    isClassDay,
    punctualityScoreFor
};
