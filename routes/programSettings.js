const express = require("express");
const router = express.Router();
const {
    getProgramSettings,
    updateProgramSettings
} = require("../controllers/programSettingsController");
// NOTE: authorizedTutor calls authenticate internally, so it replaces it rather
// than being chained after it. It admits both tutors and admins.
const { authenticate, authorizedTutor } = require("../middleware/authentation");

// ============== PROGRAM SETTINGS ROUTES ==============

// Readable by everyone signed in — clients default their week pickers from it.
router.get("/settings/program", authenticate, getProgramSettings);

// Writable by tutors and admins.
router.patch("/settings/program", authorizedTutor, updateProgramSettings);

module.exports = router;
