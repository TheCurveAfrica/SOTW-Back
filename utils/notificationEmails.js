// Email bodies for the notification system. Built on the same shell as
// utils/registrationEmail.js (same logo, same Lato/table markup) so every mail
// the platform sends looks like it came from the same place.

const APP_URL = process.env.APP_URL || "https://www.the-curve.africa";

// Email clients render user-supplied text as HTML, so anything a student typed
// (a reason, a catch-up plan, a task title) is escaped before it goes in.
const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// "2026-09-07" -> "Monday, 7 September 2026". Parsed by parts rather than with
// new Date(str), which would read the string as UTC and can shift the weekday.
const formatDateString = (value) => {
    const [year, month, day] = String(value).split("-").map(Number);
    if (!year || !month || !day) return escapeHtml(value);

    return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
};

const formatDateList = (dates) => (dates || []).map(formatDateString).join("<br>");

const PARAGRAPH = "font-family: 'Lato', sans-serif; font-size: 18px; font-weight: 300; color: #555555; line-height: 1.6;";

// The shared shell. `heading` is the big grey title, `body` is pre-built HTML.
const layout = ({ title, heading, greeting, body }) => `
    <!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(title)}</title>
    <link href="https://fonts.googleapis.com/css?family=Lato:300,400,700" rel="stylesheet">
</head>

<body style="margin: 0; padding: 0 !important; mso-line-height-rule: exactly; background-color: #f1f1f1;">
    <center style="width: 100%; background-color: #f1f1f1;">
        <div style="max-width: 600px; margin: 0 auto;">
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
                style="margin: auto;">
                <tr>
                    <td valign="top" style="padding: 1em 2.5em 0 2.5em; background-color: #ffffff;"></td>
                </tr>
                <tr>
                    <td valign="middle" style="padding: 3em 0 2em 0;">
                        <img src="https://www.the-curve.africa/static/media/curve2.b90648ddd7482f82d25a.png" alt="The Curve Africa"
                            style="width: 300px; max-width: 600px; height: auto; margin: auto; display: block;">
                    </td>
                </tr>
                <tr>
                    <td valign="middle" style="padding: 2em 0 4em 0;">
                        <table width="100%">
                            <tr>
                                <td>
                                    <div style="padding: 0 2.5em; text-align: center;">
                                        <h2 style="font-family: 'Lato', sans-serif; color: rgba(0,0,0,.3); font-size: 32px; margin-bottom: 0; font-weight: 400;">
                                            ${escapeHtml(heading)}</h2>
                                        <h3 style="font-family: 'Lato', sans-serif; font-size: 24px; font-weight: 300;">
                                            Hi ${escapeHtml(greeting)},</h3>
                                        ${body}
                                        <p style="${PARAGRAPH} margin-top: 30px;">
                                            Thanks,<br>THE CURVE AFRICA
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
                style="margin: auto;">
                <tr>
                    <td style="text-align: center; background-color: #fafafa; font-family: 'Lato', sans-serif; font-size: 13px; color: #888888; padding: 1em 0;">
                        &copy; Copyright ${new Date().getFullYear()}. All rights reserved.<br />
                    </td>
                </tr>
            </table>
        </div>
    </center>
</body>

</html>
`;

const button = (href, label) => `
    <p style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(href)}"
           style="font-family: 'Lato', sans-serif; background-color: #ffb703; color: #08022b; text-decoration: none;
                  padding: 14px 32px; border-radius: 999px; font-size: 17px; display: inline-block;">
            ${escapeHtml(label)}
        </a>
    </p>
`;

// A framed block of detail rows, used for dates/reasons.
const detailBlock = (rows) => `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
        style="background-color: #fafafa; border-radius: 8px; margin: 24px 0;">
        <tr>
            <td style="padding: 20px 24px; text-align: left;">
                ${rows.map(([label, value]) => `
                <p style="font-family: 'Lato', sans-serif; font-size: 15px; color: #888888; margin: 0 0 4px 0;">
                    ${escapeHtml(label)}</p>
                <p style="font-family: 'Lato', sans-serif; font-size: 17px; color: #333333; margin: 0 0 16px 0; line-height: 1.5;">
                    ${value}</p>`).join("")}
            </td>
        </tr>
    </table>
`;

const generateTaskPostedEmail = ({ studentName, title, week, stack, formattedDueDate }) => layout({
    title: "New Task Posted",
    heading: "New Task Posted",
    greeting: studentName || "there",
    body: `
        <p style="${PARAGRAPH}">
            A new task has been posted for <strong>Week ${escapeHtml(week)}</strong>.
        </p>
        ${detailBlock([
            ["Task", escapeHtml(title)],
            ["Stack", escapeHtml(stack)],
            ["Due", escapeHtml(formattedDueDate)]
        ])}
        ${button(`${APP_URL}/assessments`, "View the task")}
        <p style="${PARAGRAPH} font-size: 16px;">
            Submit before the deadline so your work is graded on time.
        </p>
    `
});

const generateExceptionRequestEmail = ({ tutorName, studentName, stack, dates, reasonCategory, reason }) => layout({
    title: "Class Exception Request",
    heading: "Class Exception Request",
    greeting: tutorName || "there",
    body: `
        <p style="${PARAGRAPH}">
            <strong>${escapeHtml(studentName)}</strong> has requested to be excused from class.
        </p>
        ${detailBlock([
            ["Student", `${escapeHtml(studentName)}${stack ? ` &middot; ${escapeHtml(stack)}` : ""}`],
            ["Class day(s)", formatDateList(dates)],
            ["Reason", escapeHtml(reasonCategory)],
            ["Details", escapeHtml(reason)]
        ])}
        ${button(`${APP_URL}/checkin`, "Review the request")}
    `
});

const generateExceptionReviewedEmail = ({ studentName, status, dates, reviewNote }) => {
    const approved = status === "Approved";

    return layout({
        title: `Class Exception ${status}`,
        heading: `Request ${status}`,
        greeting: studentName || "there",
        body: `
            <p style="${PARAGRAPH}">
                Your request to be excused from class has been <strong>${escapeHtml(status.toLowerCase())}</strong>.
            </p>
            ${detailBlock([
                ["Class day(s)", formatDateList(dates)],
                ...(reviewNote ? [["Note from your tutor", escapeHtml(reviewNote)]] : [])
            ])}
            <p style="${PARAGRAPH} font-size: 16px;">
                ${approved
                    ? "These class days are now marked as excused. You are still responsible for catching up on anything covered."
                    : "Please speak with your tutor if you still need to be away."}
            </p>
            ${button(`${APP_URL}/checkin`, "View your requests")}
        `
    });
};

module.exports = {
    generateTaskPostedEmail,
    generateExceptionRequestEmail,
    generateExceptionReviewedEmail
};
