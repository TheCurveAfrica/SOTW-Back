const express = require("express");
const router = express.Router();
const { addRatings, getRatings, deleteRatingss, uploadRatingsExcel } = require("../controllers/ratings");
const multer = require("../middleware/multer");
const { authorizedTutor } = require("../middleware/authentation");

router.post("/add/:id", addRatings);
router.get("/get/:id", getRatings);
router.delete("/delete/:studentId/:week", deleteRatingss);

// Bulk upload ratings from Excel (Tutors only)
router.post("/upload-excel", authorizedTutor, multer.single("file"), uploadRatingsExcel);

module.exports = router;