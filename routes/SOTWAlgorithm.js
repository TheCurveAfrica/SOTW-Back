const express = require("express");
const router = express.Router();
const theAlgorithm = require("../controllers/SOTWAlgorithm");
// NOTE: authorizedTutor calls authenticate internally, so it replaces it rather
// than being chained after it.
const { authorizedTutor } = require("../middleware/authentation");

router.use((req, res, next)=>{
    console.log("API Called", new Date());
    next();
});

// Selecting a student of the week writes a permanent record that the dashboard
// reads, so these are restricted to tutors and admins.
router.post("/sotwfront/", authorizedTutor, (req, res, next)=>{theAlgorithm.chooseFrontEndSOTW(req, res, next)});
router.post("/sotwback/", authorizedTutor, (req, res, next)=>{theAlgorithm.chooseBackEndSOTW(req, res, next)});
router.post("/sotwproduct/", authorizedTutor, (req, res, next)=>{theAlgorithm.chooseProductSOTW(req, res, next)});
router.post("/sotm/", authorizedTutor, (req, res, next)=>{theAlgorithm.chooseStudentsOfTheMonth(req, res, next)});
router.post("/position", (req, res, next)=>{theAlgorithm.setStudentsPosition(req, res, next)});

module.exports = router;