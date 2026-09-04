const userModel = require("../models/userModel");
// The roster lives in models/users.js (`SOWusers`), not the legacy userModel
// (`SOWuser`) above - both resolve to the `sowusers` collection, but only this
// one carries name/email/stack/role.
const User = require("../models/users");
const dataModel = require("../models/dataModel");
const assessmentModel = require("../models/assessmentModel");
const { validateUserLocation, } = require("../middleware/validator");
const Jimp = require("jimp");
const cloudinary = require("../middleware/cloudinary");
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const sharp = require("sharp");
const { cohortNow, isClassDay, punctualityScoreFor, CLASS_DAYS, ON_TIME_SCORE } = require("../utils/attendance");
const { getProgramSettings, parseDateString, getWeekStart } = require("../utils/programWeek");

const _ = require('lodash');
//const paymentModel = require("../model/ConfirmPayment");
require('dotenv').config();


const pad = (n) => String(n).padStart(2, "0");

// "YYYY-MM-DD" from a host-local Date. utils/programWeek builds its Mondays with
// host-local setters, so host-local getters are what recover the calendar day it
// meant; toISOString() would shift the day west of Greenwich.
const toDateString = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// The Mon-Sun window of a program week, as the "YYYY-MM-DD" strings that
// dataModel.date - a String, not a Date - is compared against.
const weekRange = (settings, week) => {
    const from = getWeekStart(settings, week);
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    return { from: toDateString(from), to: toDateString(to) };
};

// How many class days have already come and gone inside a window. Clamped to
// `today` because a class day still in the future is not one anyone has missed.
const classDaysElapsed = (fromStr, toStr, todayStr) => {
    const start = parseDateString(fromStr);
    const end = parseDateString(toStr > todayStr ? todayStr : toStr);
    if (!start || !end || end < start) return 0;

    let count = 0;
    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
        if (CLASS_DAYS.includes(day.getDay())) count++;
    }
    return count;
};

// A user-supplied search term goes into a $regex, so the regex metacharacters in
// it have to stop meaning anything first.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


// Function to handle the attendance of st udents
// const checkIn = async (req, res) => {
//     try {

//         const today = new Date();

//         //Checks if that day is Monday, Wednesday, or Friday (Days for classes)
//         if (today.getDay() === 1|| today.getDay() === 3 || today.getDay() === 5) {
//             const userId = req.user.id;
//             const user = await userModel.findById(userId);
//             if (!user) {
//                 return res.status(404).json({ message: "User not found" });
//             }

//             const { latitude, longitude } = req.body;


//             const apiUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;

//             // const response = await fetch(apiUrl);
//             // const data = await response.json();
//             const response = await fetch(apiUrl, {
//   headers: {
//     'User-Agent': 'student-checkin-app/1.0 (hecurvesotw@gmail.com)',
//     'Accept': 'application/json'
//   }
// });

// if (!response.ok) {
//   const errorText = await response.text();
//   return res.status(400).json({ message: `Failed to fetch location: ${response.status}`, error: errorText.slice(0, 200) });
// }

// const data = await response.json();


//             // if (!response.ok) {
//             //     return res.status(400).json({ message: `Failed to fetch location ${response.statusText}` });
//             // }

//             // Extract the address from the response
//             const location = data.display_name;

//             // const location = req.body.location.toLowerCase();

//             if (!location) {
//                 return res.status(400).json({
//                     message: "Please enter a valid location"
//                 });
//             }

//             // Check if an image is uploaded
//             if (!req.files || !req.files.image) {
//                 return res.status(400).json({ message: 'No image provided' });
//             }

//             const image = req.files.image;

//             // Check if only one file is uploaded
//             if (Array.isArray(image)) {
//                 return res.status(400).json({ message: "Please upload only one image file" });
//             }

//             // Check file extension
//             const fileExtension = path.extname(image.name).toLowerCase();
//             const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
//             if (!allowedExtensions.includes(fileExtension)) {
//                 return res.status(400).json({
//                     message: 'Only image files are allowed'
//                 });
//             }

//             // Read the image with Jimp and add watermark
//             // const jimpImage = await Jimp.read(image.tempFilePath);
//             // const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
//             // const date = today.toISOString().split('T')[0];

//             // const newDate = new Date(today.getTime()); // Create a new Date object
//             // newDate.setHours(newDate.getHours() + 1);
//             // const time = newDate.toLocaleTimeString('en-US', { hour12: true });
//             // jimpImage.print(font, 10, 10, `${location}, \n${date},  ${time}`);
//             const date = today.toISOString().split('T')[0];

//             const checkInStatus = await dataModel.find({ userId: userId });
//             if (checkInStatus.length > 0 && checkInStatus.findIndex((e)=> e.date === date) !== -1) {
//                 return res.status(400).json({
//                     message: "Sorry you can only checkIn once per day!"
//                 })
//             }

//             // Convert Jimp image to buffer
//             //const modifiedImageBuffer = await jimpImage.getBufferAsync(Jimp.MIME_JPEG); // or use the appropriate MIME type for your image format

//             //Check if the user has already uploaded/checkIn that day
//             // const checkInStatus = await dataModel.find({ userId: userId });
//             // if (checkInStatus.length > 0 && checkInStatus[0].date === date) {
//             //     return res.status(400).json({
//             //         message: "Sorry you can only checkIn once per day!"
//             //     })
//             // }


//             // Upload modified image to Cloudinary
//             // const cloudinaryUpload = await cloudinary.uploader.upload_stream({ folder: "AttendanceData-Image" },
//             //     (error, result) => {
//             //         if (error) {
//             //             return res.status(500).json({ message: 'An error occurred while uploading the image' + error.message });
//             //         }
//             //         // Delete the temporary file
//             //         fs.unlinkSync(image.tempFilePath);

//             //         let score;

//             //         let newTime = newDate.toLocaleTimeString('en-US', { hour12: false });

//             //         if (newTime > "10:00:00") {
//             //             score = 0;
//             //         } else if (newTime <= "10:00:00" && newTime >= "09:46:00") {
//             //             score = 10;
//             //         } else if (newTime <= "09:45:00" && newTime >= "00:00:00") {
//             //             score = 20;
//             //         } else {
//             //             score = 0;
//             //         }

//             //         // Save attendance data
//             //         const userData = new dataModel({
//             //             userId: userId,
//             //             location,
//             //             time,
//             //             date,
//             //             image: {
//             //                 public_id: result.public_id,
//             //                 url: result.secure_url,
//             //             },
//             //             punctualityScore: score,
//             //         });

//             //         userData.save();
//             //         user.data.push(userData);
//             //         user.save();

//             //         return res.status(200).json({
//             //             message: 'User data created successfully',
//             //             Data: userData
//             //         });
//             //     }).end(modifiedImageBuffer);



// // i watermarked the image here
// const sharp = require("sharp");
// const moment = require('moment-timezone');
// const checkInTime = moment().utcOffset('+01:00');

// const outputDir = path.join(__dirname, 'media');
// if (!fs.existsSync(outputDir)) {
//     fs.mkdirSync(outputDir, { recursive: true });
// }
//     let tempFilePath = req.files.image.tempFilePath;
// if (!fs.existsSync(tempFilePath)) {
//     console.error("Temp file does not exist:", tempFilePath);
//     return res.status(400).json({ message: "File not found" });
// }
// const dateTaken = checkInTime.format('YYYY-MM-DD');
// const timeTaken = checkInTime.format('HH:mm:ss');

//         const watermarkText = `Date: ${dateTaken}\nTime: ${timeTaken}`;
//         const fileName = path.basename(tempFilePath); 
// const outputFileName = `watermarked-${fileName}`;
// const outputFilePath = path.join(__dirname, 'media', outputFileName);

//         const newImage = sharp(tempFilePath);
//         const { width, height } = await newImage.metadata();
//         const svgText = `
//             <svg width="${width}" height="${height}">
//                <style>
//     .watermark {
//       fill: white;
//       stroke: black;
//       stroke-width: 2px;
//       font-size: ${Math.floor(width / 15)}px;
//       font-family: Arial, sans-serif;
//       text-anchor: middle;
//     }
//   </style>
//   <text x="50%" y="45%" class="watermark">
//     <tspan x="50%" dy="1.2em">Date: ${dateTaken}</tspan>
//     <tspan x="50%" dy="1.2em">Time: ${timeTaken}</tspan>
//   </text>            </svg>
//         `;

//         await newImage
//             .composite([{
//                 input: Buffer.from(svgText),
//                 blend: 'over',
//                 gravity: 'center'

//             }])
//             .toFile(outputFilePath);
        


//             // const result = await new Promise((resolve, reject) => {
//             //     cloudinary.uploader.upload_stream(
//             //       { folder: "AttendanceData-Image" },
//             //       (error, result) => {
//             //         if (error) return reject(error);
//             //         resolve(result);
//             //       }
//             //     ).end(modifiedImageBuffer);
//             //   });
//                       const result= await cloudinary.uploader.upload(outputFilePath, { folder: 'AttendanceData-Image' });

//               // Once Cloudinary upload succeeds, continue
//               fs.unlinkSync(image.tempFilePath);
//                           const newDate = new Date(today.getTime()); // Create a new Date object

//               let score;
//               let newTime = newDate.toLocaleTimeString('en-US', { hour12: false });
//               const time = newDate.toLocaleTimeString('en-US', { hour12: true });

//               if (newTime > "10:00:00") {
//                 score = 0;
//               } else if (newTime <= "10:00:00" && newTime >= "09:46:00") {
//                 score = 10;
//               } else if (newTime <= "09:45:00" && newTime >= "00:00:00") {
//                 score = 20;
//               } else {
//                 score = 0;
//               }
              
//               // Save attendance data
//               const userData = new dataModel({
//                 userId,
//                 location,
//                 time,
//                 date,
//                 image: {
//                   public_id: result.public_id,
//                   url: result.secure_url,
//                 },
//                 punctualityScore: score,
//               });
              
//               await userData.save();
//               user.data.push(userData);
//               await user.save();
              
//               return res.status(200).json({
//                 message: 'User data created successfully',
//                 Data: userData,
//               });
              
//         } else {
//             return res.status(400).json({
//                 message: "Sorry you can't checkIn today!"
//             });
//         }

//     } catch (error) {
//         return res.status(500).json({
//             message: 'Internal Server Error: ' + error.message,
//         });
//     } 
//     // finally {
//     //     if (req.files && req.files.image) {
//     //         fs.unlinkSync(req.files.image.tempFilePath);
//     //     }
//     // }
// };




// Cleanup is best-effort: an already-removed temp file must never turn into a 500.
const safeUnlink = (filePath) => {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Failed to remove temp file:', filePath, error.message);
  }
};

const checkIn = async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ message: 'No image provided' });
      }

      const tempFilePath = req.file.path; // multer saved file
      // Declared out here so the catch below can clean it up too.
      let outputFilePath = null;

  try {
    const checkInTime = cohortNow();

    if (isClassDay(checkInTime)) {
      const userId = req.user.id;
      const user = await userModel.findById(userId);
      if (!user) {
              fs.unlinkSync(tempFilePath);

        return res.status(404).json({ message: "User not found" })}
      ;

      const { latitude, longitude } = req.body;
      const apiUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;

      const response = await fetch(apiUrl, {
        headers: {
            
          'User-Agent': 'student-checkin-app/1.0 (hecurvesotw@gmail.com)',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
              fs.unlinkSync(tempFilePath);

        const errorText = await response.text();
        return res.status(400).json({ message: `Failed to fetch location: ${response.status}`, error: errorText.slice(0, 200) });
      }

      const data = await response.json();
      const location = data.display_name;
      if (!location){      fs.unlinkSync(tempFilePath);
 
        return res.status(400).json({ message: "Please enter a valid location" })};

            // One pair of strings serves the duplicate check, the watermark, the
            // stored record and the score, so they can never disagree.
            const dateTaken = checkInTime.format('YYYY-MM-DD');
            const timeTaken = checkInTime.format('HH:mm:ss');

            // An excused row is a placeholder written by an approved exception
            // request, not a check-in - so a student who ends up making it in
            // after all is not blocked by their own exception. The real
            // check-in below replaces it.
            const existingRecord = await dataModel.findOne({ userId: userId, date: dateTaken });
            const excusedRecordId = existingRecord?.status === "excused" ? existingRecord._id : null;

            if (existingRecord && !excusedRecordId) {
                      fs.unlinkSync(tempFilePath);

                return res.status(400).json({
                    message: "Sorry you can only checkIn once per day!"
                })
            }

      // Watermark with sharp
      const outputDir = path.join(__dirname, 'media');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const watermarkText = `Date: ${dateTaken}\nTime: ${timeTaken}`;

      const fileName = path.basename(tempFilePath);
      const outputFileName = `watermarked-${fileName}`;
      outputFilePath = path.join(outputDir, outputFileName);

      const newImage = sharp(tempFilePath);

      // A client that captures before the webcam has decoded a frame uploads a
      // valid but entirely black JPEG. Reject it here, before any record exists,
      // so the once-per-day check above still lets the user retry. This has to
      // run on the original upload: the white watermark composited below would
      // add enough variance and entropy to mask a blank frame.
      const stats = await newImage.stats();
      const isBlank =
        stats.entropy < 0.1 &&
        stats.channels.every((channel) => channel.stdev < 3 && channel.mean < 8);
      if (isBlank) {
        fs.unlinkSync(tempFilePath);
        return res.status(400).json({
          message: "The captured photo was blank. Please retry your check-in."
        });
      }

      const { width, height } = await newImage.metadata();
      const svgText = `
        <svg width="${width}" height="${height}">
          <style>
            .watermark {
              fill: white;
              stroke: black;
              stroke-width: 2px;
              font-size: ${Math.floor(width / 15)}px;
              font-family: Arial, sans-serif;
              text-anchor: middle;
            }
          </style>
          <text x="50%" y="45%" class="watermark">
            <tspan x="50%" dy="1.2em">Date: ${dateTaken}</tspan>
            <tspan x="50%" dy="1.2em">Time: ${timeTaken}</tspan>
          </text>
        </svg>
      `;

      await newImage
        .composite([{ input: Buffer.from(svgText), blend: 'over', gravity: 'center' }])
        .toFile(outputFilePath);

      const result = await cloudinary.uploader.upload(outputFilePath, { folder: 'AttendanceData-Image' });

      safeUnlink(tempFilePath);
      safeUnlink(outputFilePath);

      const score = punctualityScoreFor(timeTaken);

      // Clear the excused placeholder first, so turning up leaves exactly one
      // record for the day - a real, scored check-in.
      if (excusedRecordId) {
        await dataModel.deleteOne({ _id: excusedRecordId });
        user.data.pull(excusedRecordId);
      }

      const userData = new dataModel({
        userId,
        location,
        time: timeTaken,
        date: dateTaken,
        image: { public_id: result.public_id, url: result.secure_url },
        punctualityScore: score,
      });

      await userData.save();
      user.data.push(userData);
      await user.save();

      return res.status(200).json({ message: 'User data created successfully', Data: userData });

    } else {
              fs.unlinkSync(tempFilePath);

      return res.status(400).json({ message: "Sorry you can't checkIn today!" });
    }
  } catch (error) {
    safeUnlink(tempFilePath);
    safeUnlink(outputFilePath);

    return res.status(500).json({ message: 'Internal Server Error: ' + error.message });
  }
};
// Function to get the assessment for a students by the reviewer
const assessmentData = async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Get the current date
        const currentDate = new Date();

        // Calculate the start of the current week
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

        // Calculate the end of the current week
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        //Check if it's Friday or Weekend to review punctuality score
        if (currentDate.getDay() < 5) {
            return res.status(400).json({
                message: "Sorry you can't review punctuality score till Friday or Saturday"
            })
        }

        const checkAssessment = await assessmentModel.findOne({
            userId: userId,
            weekStart: startOfWeek.toISOString().split('T')[0]
        });
        if (checkAssessment) {
            return res.status(400).json({
                message: "Sorry! you've already reviewed punctuality score for this week for this student"
            })
        }

        // Fetch attendance data for the current week
        const attendanceData = await dataModel.find({
            userId: userId,
            // date: {
            //     $gte: startOfWeek.toISOString().split('T')[0],
            //     $lt: endOfWeek.toISOString().split('T')[0]
            // }
        }
    );

        // Function to delete image by public_id
        const deleteImage = async (public_id) => {
            try {
                const result = await cloudinary.uploader.destroy(public_id);
            } catch (error) {
                console.error('Error deleting image:', error.message);
            }
        };

        // Aggregate the attendance data to calculate total score and count for each user
        const aggregatedData = attendanceData.reduce((acc, curr) => {
            const { userId, punctualityScore, image } = curr;

            // Excused days carry a 0 they were never meant to be scored on -
            // they exist to show up in attendance history, not to be averaged.
            // Counting one would lower the score, which is the opposite of
            // being excused. See models/dataModel.js.
            if (curr.status === "excused") return acc;

            // If userId doesn't exist in accumulator, initialize it with totalScore and count as 0
            if (!acc[userId]) {
                acc[userId] = { totalScore: 0, count: 0 };
            }

            // Accumulate totalScore and increment count
            acc[userId].totalScore += punctualityScore;
            acc[userId].count++;

            // Delete image associated with the user
            if (image && image.public_id) {
                deleteImage(image.public_id);
            }

            // Update the documents to remove the image field
            Promise.all(attendanceData.map(async (data) => {
                await dataModel.updateOne({ image: image }, { $unset: { image: 1 } });
            }));

            return acc;
        }, {});

        // Prepare assessment data to be saved
        const savedAssessmentData = Object.keys(aggregatedData).map(userId => {
            const { totalScore, count } = aggregatedData[userId];
            const averagePunctualityScore = totalScore / count;
            return {
                weekStart: startOfWeek.toISOString().split('T')[0],
                weekEnd: endOfWeek.toISOString().split('T')[0],
                averagePunctualityScore: averagePunctualityScore,
            };
        });

        // Save assessment data to the database
        const savedDocuments = await assessmentModel.create(savedAssessmentData);

        if (savedDocuments.length > 0) {
            savedDocuments[0].userId.push(userId);
            await savedDocuments[0].save();
        }


        // Return the assessment data
        return res.status(200).json({
            message: "Assessment data fetched successfully",
            data: savedDocuments[0]
        });
    } catch (error) {
        return res.status(500).json({
            message: 'Internal Server Error: ' + error.message,
        });
    }
};



// Function to get the assessment for all students by the reviewer
const assessmentDataS = async (req, res) => {
    try {
        // Get the current date
        const currentDate = new Date();

        // Calculate the start of the current week
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

        // Calculate the end of the current week
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        //Check if it's Friday or Weekend to review punctuality score
        if (currentDate.getDay() < 5) {
            return res.status(400).json({
                message: "Sorry you can't review punctuality score till Friday or Saturday"
            })
        }

        const checkAssessment = await assessmentModel.findOne({ weekStart: startOfWeek.toISOString().split('T')[0] });
        if (checkAssessment) {
            return res.status(400).json({
                message: "Sorry! you've already reviewed punctuality score for this week"
            })
        }

        // Fetch attendance data for the current week
        const attendanceData = await dataModel.find({
            date: {
                $gte: startOfWeek.toISOString().split('T')[0],
                $lt: endOfWeek.toISOString().split('T')[0]
            }
        });

        // Function to delete image by public_id
        const deleteImage = async (public_id) => {
            try {
                const result = await cloudinary.uploader.destroy(public_id);
            } catch (error) {
                console.error('Error deleting image:', error.message);
            }
        };

        // Aggregate the attendance data to calculate total score and count for each user
        const aggregatedData = attendanceData.reduce((acc, curr) => {
            const { userId, punctualityScore, image } = curr;

            // Excused days carry a 0 they were never meant to be scored on -
            // they exist to show up in attendance history, not to be averaged.
            // Counting one would lower the score, which is the opposite of
            // being excused. See models/dataModel.js.
            if (curr.status === "excused") return acc;

            // If userId doesn't exist in accumulator, initialize it with totalScore and count as 0
            if (!acc[userId]) {
                acc[userId] = { totalScore: 0, count: 0 };
            }

            // Accumulate totalScore and increment count
            acc[userId].totalScore += punctualityScore;
            acc[userId].count++;

            // Delete image associated with the user
            if (image && image.public_id) {
                deleteImage(image.public_id);
            }

            // Update the documents to remove the image field
            Promise.all(attendanceData.map(async (data) => {
                await dataModel.updateOne({ image: image }, { $unset: { image: 1 } });
            }));

            return acc;
        }, {});

        // Prepare assessment data to be saved
        const savedAssessmentData = Object.keys(aggregatedData).map(userId => {
            const { totalScore, count } = aggregatedData[userId];
            const averagePunctualityScore = totalScore / count;
            return {
                //userId,
                weekStart: startOfWeek.toISOString().split('T')[0],
                weekEnd: endOfWeek.toISOString().split('T')[0],
                averagePunctualityScore: averagePunctualityScore,
            };
        });

        // Save assessment data to the database
        const savedDocuments = await assessmentModel.create(savedAssessmentData);

        // Iterate over each saved document and push user into userId array
        for (const savedDocument of savedDocuments) {
            const userId = savedDocument.userId;
            const user = await userModel.findById(userId);
            if (user) {
                savedDocument.userId.push(user);
                await savedDocument.save();
            }
        }

        // Return the assessment data
        return res.status(200).json({
            message: "Assessment data fetched successfully",
            data: savedDocuments
        });
    } catch (error) {
        return res.status(500).json({
            message: 'Internal Server Error: ' + error.message,
        });
    }
};



//Function to fetch checkIn data for a student for a particular week
const fetchCheckInWeekly = async (req, res) => {
    try {

        const userId = req.params.userId

        // Despite the name this returns the student's whole history by default -
        // the date filter below is opt-in. Passing ?week=N narrows it to that
        // program week; without the param the response is what it has always
        // been, which the callers that page through a full history rely on.
        const query = { userId: userId };

        if (req.query.week !== undefined && req.query.week !== "") {
            const requestedWeek = Number(req.query.week);
            if (!Number.isInteger(requestedWeek) || requestedWeek < 1) {
                return res.status(400).json({
                    message: "week must be a positive integer",
                });
            }

            const settings = await getProgramSettings();
            const range = weekRange(settings, requestedWeek);
            query.date = { $gte: range.from, $lte: range.to };
        }

        const attendanceData = await dataModel.find(query);

        if (!attendanceData) {
            return res.status(400).json({
                message: "Attendance data for student not found",
            })
        }

        // Aggregate the attendance data to calculate total score and count for a user
        const aggregatedData = attendanceData.reduce((acc, curr) => {
            const { userId, punctualityScore } = curr;

            // Excused days are returned to the client in `data` below so the
            // student sees them in their history, but they must not enter the
            // average - see models/dataModel.js.
            if (curr.status === "excused") return acc;

            // If userId doesn't exist in accumulator, initialize it with totalScore and count as 0
            if (!acc[userId]) {
                acc[userId] = { totalScore: 0, count: 0 };
            }

            // Accumulate totalScore and increment count
            acc[userId].totalScore += punctualityScore;
            acc[userId].count++;

            return acc;
        }, {});

        const savedAssessmentData = Object.keys(aggregatedData).map(userId => {
            const { totalScore, count } = aggregatedData[userId];
            const averagePunctualityScore = totalScore / count;

            return averagePunctualityScore
        });


        return res.status(200).json({
            message: "Student attendance data successfully fetched: ",
            averagePunctualityScore: savedAssessmentData[0],
            data: attendanceData,
        });


    } catch (error) {
        return res.status(500).json({
            message: 'Internal Server Error: ' + error.message,
        });
    }
}


//Function to fetch checkIn data for all student for a particular week and group by their userId
const fetchAllCheckInWeekly = async (req, res) => {
    try {
        // Get the current date
        const currentDate = new Date();

        // Calculate the start of the current week
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

        // Calculate the end of the current week
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // Fetch attendance data for the current week
        const attendanceData = await dataModel.find({
            date: {
                $gte: startOfWeek.toISOString().split('T')[0],
                $lte: endOfWeek.toISOString().split('T')[0]
            }
        });

        if (!attendanceData || attendanceData.length === 0) {
            return res.status(400).json({
                message: "Attendance data for student not found",
            })
        }

        // Group attendance data by userId using lodash's groupBy function
        const groupedData = _.groupBy(attendanceData, 'userId');

        return res.status(200).json({
            message: "Student attendance data successfully fetched: ",
            data: groupedData
        });


    } catch (error) {
        return res.status(500).json({
            message: 'Internal Server Error: ' + error.message,
        });
    }
}


/**
 * Every student with their attendance rolled up - the tutor-facing "Attendance
 * Records" table.
 *
 * Summary only. The individual check-ins behind a row are fetched per student by
 * fetchCheckInWeekly when that row is expanded, so this response stays small no
 * matter how long the cohort has been running.
 *
 * Query: ?week=N (a program week; omitted means all-time), ?search=, ?stack=.
 */
const fetchAttendanceOverview = async (req, res) => {
    try {
        let requestedWeek = null;
        if (req.query.week !== undefined && req.query.week !== "") {
            requestedWeek = Number(req.query.week);
            if (!Number.isInteger(requestedWeek) || requestedWeek < 1) {
                return res.status(400).json({
                    message: "week must be a positive integer",
                });
            }
        }

        const settings = await getProgramSettings();
        const range = requestedWeek === null ? null : weekRange(settings, requestedWeek);

        // `stack` has no enum on the user schema, so this is an exact match the
        // client only sends when it holds a value it got from the server.
        const studentQuery = { role: "student" };
        if (req.query.stack) studentQuery.stack = req.query.stack;
        if (req.query.search) {
            const term = escapeRegex(String(req.query.search).trim());
            if (term) {
                studentQuery.$or = [
                    { name: { $regex: term, $options: "i" } },
                    { email: { $regex: term, $options: "i" } },
                ];
            }
        }

        const students = await User.find(studentQuery)
            .select("name email image stack")
            .sort({ name: 1 });

        // No roster means no rollup to do, and an empty $in would match every
        // document rather than none.
        if (students.length === 0) {
            return res.status(200).json({
                message: "Attendance overview fetched successfully",
                week: requestedWeek,
                range,
                maxScore: ON_TIME_SCORE,
                students: [],
            });
        }

        const match = { userId: { $in: students.map((student) => student._id) } };
        if (range) match.date = { $gte: range.from, $lte: range.to };

        const rollup = await dataModel.aggregate([
            { $match: match },
            {
                $group: {
                    // userId is an array holding a single id - see models/dataModel.js.
                    _id: { $arrayElemAt: ["$userId", 0] },
                    presentCount: { $sum: { $cond: [{ $eq: ["$status", "excused"] }, 0, 1] } },
                    excusedCount: { $sum: { $cond: [{ $eq: ["$status", "excused"] }, 1, 0] } },
                    // Excused days carry a 0 that must never reach an average, so
                    // they stay out of both the total and the divisor. Legacy rows
                    // written before the enum existed have no status at all, and
                    // correctly fall through as present.
                    scoreTotal: { $sum: { $cond: [{ $eq: ["$status", "excused"] }, 0, "$punctualityScore"] } },
                    scoredCount: { $sum: { $cond: [{ $eq: ["$status", "excused"] }, 0, 1] } },
                    firstDate: { $min: "$date" },
                    lastDate: { $max: "$date" },
                },
            },
        ]);

        const byStudent = new Map(rollup.map((row) => [String(row._id), row]));

        const today = cohortNow().format("YYYY-MM-DD");
        // The window missed days are counted over: the requested week, or the
        // whole program. With no start date configured, fall back to the earliest
        // check-in anyone has on record.
        const earliestRecord = rollup.reduce(
            (earliest, row) =>
                row.firstDate && (!earliest || row.firstDate < earliest) ? row.firstDate : earliest,
            null
        );
        const countFrom = range
            ? range.from
            : parseDateString(settings?.startDate)
                ? settings.startDate
                : earliestRecord;
        const classDays = countFrom
            ? classDaysElapsed(countFrom, range ? range.to : today, today)
            : 0;

        const payload = students.map((student) => {
            const row = byStudent.get(String(student._id));
            const presentCount = row ? row.presentCount : 0;
            const excusedCount = row ? row.excusedCount : 0;
            const scoredCount = row ? row.scoredCount : 0;

            return {
                _id: student._id,
                name: student.name,
                email: student.email,
                image: student.image,
                stack: student.stack,
                presentCount,
                excusedCount,
                // A student who joined mid-program can show more class days than
                // they were ever enrolled for, so this floors at 0 rather than
                // reporting a negative.
                missedCount: Math.max(classDays - presentCount - excusedCount, 0),
                averagePunctualityScore:
                    scoredCount === 0
                        ? null
                        : Math.round((row.scoreTotal / scoredCount) * 100) / 100,
                lastCheckIn: row ? row.lastDate : null,
            };
        });

        // A roster with no attendance yet is an empty table, not an error - unlike
        // the older handlers above, which 400 on it.
        return res.status(200).json({
            message: "Attendance overview fetched successfully",
            week: requestedWeek,
            range,
            maxScore: ON_TIME_SCORE,
            students: payload,
        });

    } catch (error) {
        return res.status(500).json({
            message: 'Internal Server Error: ' + error.message,
        });
    }
}


//Function to fetch weekly assessment data for students
const fetchAssessmentData = async (req, res) => {
    try {
        // Get the current date
        const currentDate = new Date();

        // Calculate the start of the current week
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

        // Calculate the end of the current week
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // Fetch attendance data for the current week
        const assessmentData = await assessmentModel.find({
            weekStart: {
                $gte: startOfWeek.toISOString().split('T')[0],
                $lte: endOfWeek.toISOString().split('T')[0]
            },
            weekEnd: {
                $gte: startOfWeek.toISOString().split('T')[0],
                $lte: endOfWeek.toISOString().split('T')[0]
            },
        });

        if (!assessmentData) {
            return res.status(400).json({
                message: "Assessment data for students not found",
            })
        }

        return res.status(200).json({
            message: "Students assessment data successfully fetched: ",
            data: assessmentData
        });

    } catch (error) {
        return res.status(500).json({
            message: 'Internal Server Error: ' + error.message,
        });
    }
};



//Function to fetch weekly assessment data for a particular student
const fetchOneAssessmentData = async (req, res) => {
    try {
        const userId = req.params.userId;
        // Get the current date
        const currentDate = new Date();

        // Calculate the start of the current week
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

        // Calculate the end of the current week
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // Fetch attendance data for the current week
        const assessmentData = await assessmentModel.findOne({
            userId: userId,
            weekStart: {
                $gte: startOfWeek.toISOString().split('T')[0],
                $lte: endOfWeek.toISOString().split('T')[0]
            },
            weekEnd: {
                $gte: startOfWeek.toISOString().split('T')[0],
                $lte: endOfWeek.toISOString().split('T')[0]
            },
        });

        if (!assessmentData) {
            return res.status(400).json({
                message: `Assessment data for student with ID: ${userId} not found`,
            })
        }

        return res.status(200).json({
            message: "Student assessment data successfully fetched: ",
            data: assessmentData
        });

    } catch (error) {
        return res.status(500).json({
            message: 'Internal Server Error: ' + error.message,
        });
    }
};



//Function to delete a student checkIn Data
const deleteCheckIn = async (req, res) => {
    try {
        const checkInID = req.params.checkInID;

        const checkInData = await dataModel.findById(checkInID);
        if (!checkInData) {
            return res.status(404).json({
                message: "CheckIn data not found"
            })
        }

        const deleteCheckInData = await dataModel.findByIdAndDelete(checkInID);
        if (!deleteCheckInData) {
            return res.status(400).json({
                message: "Unable to delete student checkIn Data"
            });
        }

        return res.status(200).json({
            message: "Student checkIn data deleted successfully",
        })

    } catch (error) {
        return res.status(500).json({
            message: 'Internal Server Error: ' + error.message,
        });
    }
}



//Function to delete a student full week checkIn Data once
const deleteWeekCheckIn = async (req, res) => {
    try {
        const userId = req.params.userId;
        // Get the current date
        const currentDate = new Date();

        // Calculate the start of the current week
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

        // Calculate the end of the current week
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // Fetch attendance data for the current week
        const checkInData = await dataModel.find({
            userId: userId,
            // date: {
            //     $gte: startOfWeek.toISOString().split('T')[0],
            //     $lte: endOfWeek.toISOString().split('T')[0]
            // }
        });

        const groupedData = _.groupBy(checkInData, 'userId');
        const loggedInfo = groupedData[userId].map((e)=>  1 == 1? e["image"]["public_id"]: null)



        if (!checkInData || checkInData.length === 0) {
            return res.status(404).json({
                message: "CheckIn data not found"
            })
        }

        const deleteCheckInData = await dataModel.deleteMany({
            userId: userId,
            // date: {
            //     $gte: startOfWeek.toISOString().split('T')[0],
            //     $lte: endOfWeek.toISOString().split('T')[0]
            // }
        });
        if (!deleteCheckInData) {
            return res.status(400).json({
                message: "Unable to delete student checkIn Data"
            });
        }
        cloudinary.api.delete_resources(loggedInfo)
        .then(result=>console.log(result))

        return res.status(200).json({
            message: "Student checkIn data deleted successfully",
            data: loggedInfo
        })

    } catch (error) {
        return res.status(500).json({
            message: 'Internal Server Error: ' + error.message,
        });
    }
}



//Function to delete a reviewed assessment for a particular student
const deleteAssessment = async (req, res) => {
    try {
        const assessmentId = req.params.assessmentId;

        const assessment = await assessmentModel.findById(assessmentId);
        if (!assessment) {
            return res.status(404).json({
                message: "Assessment data for the student not found"
            })
        }

        const deleteAssessment = await assessmentModel.findByIdAndDelete(assessmentId);
        if (!deleteAssessment) {
            return res.status(400).json({
                message: "Unable to delete student assessment Data"
            });
        }

        return res.status(200).json({
            message: "Student assessment data deleted successfully",
        })

    } catch (error) {
        return res.status(500).json({
            message: 'Internal Server Error: ' + error.message,
        });
    }
}

const runCheck =async(req, res)=>{
    try{
        const userId = req.params.id;
        // Same WAT clock the checkIn guard uses, so this pre-check and the real
        // guard can never disagree about which day it is.
        const date = cohortNow().format('YYYY-MM-DD');
        const checkInStatus = await dataModel.find({ userId: userId });
            if (checkInStatus.some((e) => e.date === date)) {
                return res.status(400).json({
                    message: "Sorry you can only checkIn once per day!"
                })
            }
            res.status(200).json({data: checkInStatus})
    }catch(error){
        return res.status(500).json({
            message: 'Internal Server Error: ' + error.message,
        });
    }
}


const confirmPayment = async(req, res)=>{
    try{
        if(!req.body){
            res.status(400).json({message: "Please provide required data"})
        }else{
            const paymentData = await paymentModel.create(
                {
                    amount:  req.body.amount, //the notification is only sent for successful charge,
                    reference: req.body.reference,
                    status: req.body.status
                 }
            )

            res.status(200).json({message: `payment status: ${paymentData.status}`})
        }
        
    }catch(error){
        return res.status(500).json({
            message: 'Internal Server Error: ' + error.message,
        });
    }
}

const healthCheck = async (req, res) => {
    try {
        // Basic health check response
        return res.status(200).json({
            status: "success",
            message: "Server is running and healthy",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: "Server health check failed: " + error.message
        });
    }
};







module.exports = {
    checkIn,
    assessmentData,
    assessmentDataS,
    fetchCheckInWeekly,
    fetchAllCheckInWeekly,
    fetchAttendanceOverview,
    fetchAssessmentData,
    fetchOneAssessmentData,
    deleteCheckIn,
    deleteWeekCheckIn,
    deleteAssessment,
    runCheck,
    confirmPayment,
    healthCheck
}

