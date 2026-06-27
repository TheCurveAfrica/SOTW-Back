const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");

const TAB_BY_MODE = { physical: "Physical", virtual: "Virtual" };

const auth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

function normalizeSheetId(raw) {
  const match = raw?.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : raw?.split("/")[0]?.split("?")[0]?.split("#")[0];
}

let cachedDoc = null;
const cachedSheets = {};

async function getDoc() {
  if (cachedDoc) return cachedDoc;
  const doc = new GoogleSpreadsheet(normalizeSheetId(process.env.SHEET_ID), auth);
  try {
    await doc.loadInfo();
    cachedDoc = doc;
    return cachedDoc;
  } catch (err) {
    cachedDoc = null;
    throw err;
  }
}

async function getSheetForMode(learningMode) {
  if (!cachedSheets[learningMode]) {
    const doc = await getDoc();
    const tabName = TAB_BY_MODE[learningMode];
    const sheet = doc.sheetsByTitle[tabName];
    if (!sheet) {
      throw new Error(`Sheet tab "${tabName}" not found`);
    }
    cachedSheets[learningMode] = sheet;
  }
  return cachedSheets[learningMode];
}

async function appendRegistrationRow(payload) {
  const sheet = await getSheetForMode(payload.learningMode);
  await sheet.addRow({
    Timestamp: new Date().toISOString(),
    "First Name": payload.firstName,
    "Last Name": payload.lastName,
    Email: payload.email,
    Phone: payload.phone,
    Gender: payload.gender,
    Age: payload.age,
    Address: payload.address,
    Occupation: payload.occupation,
    Education: payload.education,
    "Own Laptop": payload.ownLaptop || "",
    Stack: payload.stack,
    "Why Stack": payload.whyStack,
    "Why Consider": payload.whyConsider || "",
    "Hear About": payload.hearAbout,
  });
}

module.exports = { getSheetForMode, appendRegistrationRow };
