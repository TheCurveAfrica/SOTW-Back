require("dotenv").config({path: "../config/index.env"})
const userModel = require("../models/users.js");
const tokenModel = require("../models/token.js");
const ApiError = require("../error/ApiError");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken")
const multer = require("multer");
const path = require("path");
const Cryptr = require('cryptr');
const cryptr = new Cryptr('myTotallySecretKey');
const nodemailer = require("nodemailer");
const { error } = require("console");
const crypto = require('crypto');
const cloudinary = require("cloudinary").v2;
const fs = require("fs")
const {validateStudent,validateLogin} = require("../middleware/validator.js")
const AssignmentSubmission =require("../models/AssignmentSubmission.js")
const Assignment = require("../models/Assignment.js")
const Ratings = require("../models/ratings");

const alumniModel = require("../models/Alumni");
const tutorModel = require("../models/tutors");

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      // TODO: replace `user` and `pass` values from <https://forwardemail.net>
      user: process.env.email,
      pass: process.env.mailKey,
    },
  });

cloudinary.config({ 
    cloud_name: process.env.cloud_name ,
    api_key: process.env.cloud_apiKey , 
    api_secret: process.env.api_secret  , 
    secure: true 
  });

const storage = multer.diskStorage({
    destination: function (res, file, cb){
        cb(null, "./uploads")
    },
    filename: function(res, file, cb){
        const uniqueSuffix = Date.now() + "-" + Math.floor(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname))
    }
});

const titelCase = (str) => {
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}


const createUser = async (req, res, next) => {
  let filePath = null;

  try {
    filePath = req.file?.path || null;

    const cohort = process.env.cohort;

    if (!cohort) {
      return next(ApiError.badRequest("Cohort not found"));
    }

    const { error } = validateStudent(req.body);
    if (error) {
      const err = error.details[0];

      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return res.status(400).json({
        status: false,
        field: err.path[0],
        message: err.message.replace(/"/g, ""),
      });
    }

    if (!filePath) {
      return next(ApiError.badRequest("Profile picture is required"));
    }

    const hash = await bcrypt.hash(req.body.password, 10);

    const imageShow = await cloudinary.uploader.upload(filePath);

    const newUser = await userModel.create({
      name: titelCase(req.body.name.trim()),
      email: req.body.email.trim().toLowerCase(),
      phone: req.body.phone,
      stack: req.body.stack,
      password: hash,
      cohort,
      bio: req.body.bio,
      role: "student",
      hub: req.body.hub,
      image: imageShow.secure_url,
      imageId: imageShow.public_id,
    });

    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return res.status(201).json({
      status: true,
      data: newUser,
    });

  } catch (err) {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];

      return res.status(400).json({
        status: false,
        field,
        message: `${field} already exists`,
      });
    }

    console.error("FULL ERROR:", err);

    return next(ApiError.badRequest(err.message || "Something went wrong"));
  }
};



const loginUser = async (req, res, next)=>{
    try{

        
            const { error } =validateLogin (req.body);
if (error) {
  const err = error.details[0];

 
  return res.status(400).json({
    status: false,
    field: err.path[0],
    message: err.message.replace(/"/g, ""),
  });

}
        const {email, password } = req.body;
        const user = await userModel.findOne({email: email.toLowerCase()});
        if(user){
            const pass = await bcrypt.compare(password, user.password);
            if(pass){
                const token = jwt.sign({
                    id: user._id,
                    stack: user.stack,
                    role: user.role

                }, process.env.secret_key, {expiresIn: "1d"});
                const userInfo = {
                    name:user.name,
                    stack:user.stack,
                    id:user._id,
                    role: user.role

                }
                res.status(200).json({message:"logged in", data: { token,stack: user.stack,hub:user.hub,userInfo}})
            }else{
                res.status(400).json({error: `Invalid credentials`})
            }
        }else{
            res.status(404).json({error: `Invalid credentials`})
        }
    }catch(err){
        next(ApiError.badRequest(`${err.message}`))
    }
}


const studentDashboard = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    const student = await userModel.findById(studentId).select(
      "name email image stack bio"
    );

    const submissions = await AssignmentSubmission.find({
      student: studentId,
    }).populate("assignment");

    const assignments = await Assignment.find({
      stack: student.stack,
    });

    const completed = submissions.length;

    const submittedAssignmentIds = submissions.map((s) =>
      s.assignment._id.toString()
    );

    const pending = assignments.filter(
      (a) => !submittedAssignmentIds.includes(a._id.toString())
    ).length;

    const graded = submissions.filter((s) => s.grade !== undefined);

    const avgScore =
      graded.length > 0
        ? (
            graded.reduce((acc, curr) => acc + curr.grade, 0) /
            graded.length
          ).toFixed(1)
        : 0;

    res.status(200).json({
      student,
      stats: {
        avgScore,
        completed,
        pending,
      },
    });
  } catch (err) {
    next(ApiError.badRequest(err.message));
  }
};

const forgotPassword= async(req, res, next) => {
    try{
        const {email} = req.body

        // // Check if the email exists in your user database
        const user = await userModel.find({email: req.body.email})
        
      
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }

        const checkIfTokenExists = await tokenModel.find().where("userId").equals(`${user[0]._id}`)
        
        const tokenValue = crypto.randomBytes(4).toString("hex")

        if (checkIfTokenExists.length >= 1) {
            await tokenModel.findByIdAndDelete(checkIfTokenExists[0]._id)
            // // Generate a unique token for password reset
            await tokenModel.create({
                token: tokenValue,
                userId: user[0]._id,
            })
        }else{
            // Generate a unique token for password reset
            await tokenModel.create({
                token: tokenValue,
                userId: user[0]._id,
            })
        }

        const value = user[0]?._id.toString()
        const encryptedString = cryptr.encrypt(value);


        const info = await transporter.sendMail({
            from: 'ColdDev 😎 from The curve Africa', // sender address
            to: email, // list of receivers
            subject: "Password Reset", // Subject line
            text: "", // plain text body
            html: `<!DOCTYPE html>
            <html lang="en">
            
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Password Reset</title>
            </head>
            
            <body style="font-family: 'Arial', sans-serif; margin: 0; padding: 30px; background-color: #023047;">
            
              <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="margin-top: 30px; border-radius: 5px">
                <tr>
                  <td bgcolor="#fffff" style="padding: 40px 30px 40px 30px;border-radius: 5px">
            
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="color: #023047; font-size: 24px; text-align: center;-webkit-text-stroke: 1px black;text-shadow:3px 3px 0 #000,-1px -1px 0 #000,  1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;">
                          <strong>Password Reset</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 20px; color: #555555; font-size: 16px; line-height: 1.6;">
                          <p>We received a request to reset your password. If you did not make this request, please ignore this email.</p>
                          <p>To reset your password, click the link below:</p>
                          <p style="text-align: center;">
                            <a href="https://new-student-app.vercel.app/reset/${encryptedString}" style="background-color: #FFB703; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
                          </p>
                          <p>If the button above doesn't work, you can copy and paste the following link into your browser:</p>
                          <p style="text-align: center;">https://new-student-app.vercel.app/reset/${encryptedString}</p>
                          <p style="text-align: center;">Use this token: <b>${tokenValue}</b></p>
                          <p style="margin-top: 30px;">Thanks,<br>THE CURVE AFRICA</p>
                        </td>
                      </tr>
                    </table>
            
                  </td>
                </tr>
              </table>
            
            </body>
            
            </html>`, // html body
          });
        
          console.log("Message sent", info.messageId);
          res.status(200).send("successful")

    }catch(err){
        next(ApiError.badRequest(`${err}`))
        // console.log(err)
    }
}

const resetPassword = async(req, res, next)=>{
    try{
        const userId = req.params.id;
        const decryptedString = cryptr.decrypt(userId);
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(req.body.password, salt)
        
        const theTokenItem = await tokenModel.findOne({userId: decryptedString});
        
        const token = theTokenItem.token

        if(token !== req.body.token){
            res.status(400).json({message: "incorrect token"})
        }else{
            await userModel.findByIdAndUpdate( decryptedString, {
                password: hash,
            }, {new: true})
            await tokenModel.findByIdAndDelete(
                theTokenItem._id
            );
            res.status(201).json({ message: "reset complete"})
        }

    }catch(err){
        next(ApiError.badRequest(`${err}`))
    }

}



const updateAllUsersWeekStatus = async (req, res, next) => {
    try {
        const result = await userModel.updateMany(
            {}, // empty filter to match all documents
            { 
                $set: { 
                    // week: 1,
                    assessedForTheWeek: false 
                } 
            }
        );
        
        res.status(200).json({
            message: "All users updated successfully",
            modifiedCount: result.modifiedCount
        });
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
}

const resetWeeklyAssessments = async (req, res, next) => {
    try {
        const today = new Date();
        // Check if it's Friday (5 is Friday in getDay(), 0 is Sunday)
        if (today.getDay() === 5) {
            const result = await userModel.updateMany(
                { assessedForTheWeek: true }, // only update documents where it's currently true
                { $set: { assessedForTheWeek: false } }
            );
            
            res.status(200).json({
                message: "Weekly assessments reset successfully",
                modifiedCount: result.modifiedCount
            });
        } else {
            res.status(200).json({
                message: "No reset needed - not Friday",
                modifiedCount: 0
            });
        }
    } catch (err) {
        next(ApiError.badRequest(`${err}`));
    }
}

const allExistEmailsToLowerCase = async (req, res) => {
    try {
        const users = await userModel.find();
        let updated = 0;
        let failed = 0;
        for (const user of users) {
            const lowerCaseEmail = user.email.toLowerCase();
            if (user.email !== lowerCaseEmail) {
                try {
                    await userModel.updateOne({ _id: user._id }, { $set: { email: lowerCaseEmail } });
                    updated++;
                } catch (err) {
                    failed++;
                    console.error(`Failed to update user ${user._id}:`, err.message);
                }
            }
        }
        console.log(`Emails updated: ${updated}, failed: ${failed}`);
        if (res) {
            res.status(200).json({ message: "Email lowercase conversion complete.", updated, failed });
        }
    } catch (err) {
        console.error("Error updating emails:", err.message);
        if (res) {
            res.status(500).json({ error: "Some emails may not have been updated due to errors.", details: err.message });
        }
    }
}


const deleteUser = async(req, res, next)=>{
    try{
        const Id = req.params.id;
        const user = await userModel.findById(Id);
        await cloudinary.uploader.destroy(user.imageId);
        await userModel.findByIdAndDelete(Id);
        res.status(200).json({msg: 'deleted'})
    }catch(err){
        next(ApiError.badRequest(`${err}`))
    }
}

const getUser = async (req, res, next)=>{
    try{
        const id = req.params.id;
        const user = await userModel.findById(id);
        res.status(200).json({data: user})
    }catch(err){
        next(ApiError.badRequest(`${err}`))
    }
}

const getOneUser = async (req, res, next)=>{
    try{
        const id = req.user.id;
        const user = await userModel.findById(id);
        res.status(200).json({data: user})
    }catch(err){
        next(ApiError.badRequest(`${err}`))
    }
}

const updateUser = async (req, res, next)=>{
    try{
        const id = req.user.id;
        const user = await userModel.findById(id);
        if(!user){
            return res.status(404).json('User not Found');
        }
        if(req.file){
           if(user.imageId){
                await cloudinary.uploader.destroy(user.imageId);
            }
            const result = await cloudinary.uploader.upload(req.file.path);
            user.image = result.secure_url;
            user.imageId = result.public_id;
        }
        user.name = req.body.name || user.name;
        user.email = req.body.email || user.email;
        user.phone = req.body.phone || user.phone;
        user.bio = req.body.bio || user.bio;
        await user.save();
        res.status(200).json({data: user})
    }catch(err){
        next(ApiError.badRequest(`${err}`))
    }
}

const secondUpdate = async(req,res,next)=>{
    try {
        const id = req.params.id
        const checkUser = await userModel.findById(id)
        if (!checkUser) {
            return res.status(404).json('User not Found');
        }

        const Data={
            name: req.body.name || checkUser.name,
            // password: req.body.password || checkUser.password,
            email: checkUser.email,
            phone: req.body.phone || checkUser.phone,
            bio: req.body.bio || checkUser.bio,
        }
        if (req.body.email) {
            const emailExists = await userModel.findOne({email: req.body.email.toLowerCase()});
            if (emailExists && emailExists._id.toString() !== id) {
                return res.status(400).json({message: "Email already in use"});
            } else {
                Data.email = req.body.email.toLowerCase();
            }
        }

        if(req.file){
           // Data.image = path.join('/uploads', req.file.filename); OR
            Data.image = req.file.path //cloudinary provide the image URL in req.file.path
        } else {
            Data.image= checkUser.image;
        }
        if(req.body.password){
            const salt = await bcrypt.gensync(10)
            Data.password = await bcrypt.hash(req.body.password, salt)
        } else{
            Data.password = checkUser.password
        }
        const updatedDetails = await userModel.findByIdAndUpdate(id, Data, { new: true });
        res.status(200).json({message: "Details Updated"})
    } catch (err) {
        next(ApiError.badRequest(`${err}`))
    }
}
const getUsers = async (req, res, next)=>{
    try{
        const users = await userModel.find();
        res.status(200).json({data: users})
    }catch(err){
        next(ApiError.badRequest(`${err}`))
    }
}



const makeAlumni = async(req, res, next)=>{
    try{
        const id = req.params.id;
        const user = await userModel.findByIdAndUpdate(id, {
            role: "alumni",
        }, {new: true});
        res.status(200).json({message: "successfully made an Alumni"});
    }catch(err){
        next(ApiError.badRequest(`${err}`))
    }
}
const makeStudent = async(req, res, next)=>{
    try{
        const id = req.params.id;
        const user = await userModel.findByIdAndUpdate(id, {
            role: "student",
        }, {new: true});
        res.status(200).json({message: "successfully made a Student"});
    }catch(err){
        next(ApiError.badRequest(`${err}`))
    }
}


//      

const getDashboardStats = async (req, res, next) => {
  try {
    const [students, staffs, alumnis] = await Promise.all([
      userModel.find({ role: "student" }).countDocuments(),
      userModel.find({ role: "tutor" }).countDocuments(), 
        userModel.find({role: "alumni"}).countDocuments()
    
    ]);

    res.status(200).json({
      success: true,
      data: {
        students,
        staffs,
        alumnis,
      },
    });
  } catch (error) {
    next(error);
  }
};
const getAllStudents = async (req, res, next) => {
  try {
    const students = await userModel
      .find({role: "student"})
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (error) {
    next(error);
  }
};

const getAllStaffs = async (req, res, next) => {
  try {
    const staffs = await userModel
      .find({ role: "tutor" })
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: staffs.length,
      data: staffs,
    });
  } catch (error) {
    next(error);
  }
};

const getAllAlumnis = async (req, res, next) => {
  try {
    const alumnis = await userModel
      .find({ role: "alumni" })
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: alumnis.length,
      data: alumnis,
    });
  } catch (error) {
    next(error);
  }
};

const getSingleStudent = async (req, res, next) => {
  try {
    const student = await userModel
      .findById(req.params.id)
      .select("-password")
      .populate("allRatings assignments");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

const getSingleStaff = async (req, res, next) => {
  try {
    const staff = await userModel
      .findById(req.params.id)
      .populate("rating");

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    res.status(200).json({
      success: true,
      data: staff,
    });
  } catch (error) {
    next(error);
  }
};

const getSingleAlumni = async (req, res, next) => {
  try {
    const alumni = await userModel
      .findById(req.params.id)
      .select("-password");

    if (!alumni) {
      return res.status(404).json({ message: "Alumni not found" });
    }

    res.status(200).json({
      success: true,
      data: alumni,
    });
  } catch (error) {
    next(error);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await userModel.findById(userId).select("name email bio image role");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const profile = {
      name: user.name,
      email: user.email,
      bio: user.bio,
      image: user.image
    };

    // Only add stats if student
    if (user.role === "student") {
      // Get all ratings for the student
      const ratings = await Ratings.find({ student: userId });
      const averageScore = ratings.length > 0
        ? (ratings.reduce((sum, r) => sum + (r.total || 0), 0) / ratings.length).toFixed(2)
        : null;

      // Get all submissions for the student
      const submissions = await AssignmentSubmission.find({ student: userId });
      // Completed assessments: graded assignments
      const completedAssessments = submissions.filter(s => s.grade !== undefined && s.grade !== null).length;
      // Pending assignments: submitted but not graded
      const pendingAssignments = submissions.filter(s => s.grade === undefined || s.grade === null).length;

      profile.stat = {
        averageScore: averageScore ? Number(averageScore) : 0,
        completedAssessments,
        pendingAssignments
      };
    }

    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
};

// Rankings and Top Assignment Scorers Endpoint
const getRankingsAndTopAssignments = async (req, res, next) => {
  try {

    // Normalize stack query for flexible matching (case/space-insensitive)
    let stackQuery = null;
    if (req.query.stack) {
      // Remove spaces and lowercase for matching
      const normalized = req.query.stack.replace(/\s+/g, '').toLowerCase();
      stackQuery = normalized;
    }

    // 1. Rankings (from Ratings)
    // Get all students (fetch all, filter in-memory for robust normalization)
    let students = await userModel.find({ role: "student" }).select("_id name stack");
    if (stackQuery) {
      students = students.filter(s => {
        const normalizedStack = (s.stack || "").replace(/\s+/g, '').toLowerCase();
        return normalizedStack === stackQuery;
      });
    }

    // Get all ratings for these students
    const studentIds = students.map(s => s._id);
    const ratings = await Ratings.find({ student: { $in: studentIds } });

    // Group ratings by student
    const ratingsByStudent = {};
    ratings.forEach(r => {
      const sid = r.student.toString();
      if (!ratingsByStudent[sid]) ratingsByStudent[sid] = [];
      ratingsByStudent[sid].push(r);
    });

    // Calculate averages
    const rankings = students.map(student => {
      const sid = student._id.toString();
      const studentRatings = ratingsByStudent[sid] || [];
      const count = studentRatings.length;
      // Use correct field names from ratings.js
      const fields = ["punctuality", "Assignments", "personalDefense", "classParticipation", "classAssessment"];
      const averages = {};
      let overallSum = 0;
      fields.forEach(field => {
        const avg = count > 0 ? studentRatings.reduce((sum, r) => sum + (r[field] || 0), 0) / count : 0;
        averages[field] = Number(avg.toFixed(2));
        overallSum += avg;
      });
      const overallScore = count > 0 ? overallSum / fields.length : 0;
      return {
        studentName: student.name,
        stack: student.stack,
        overallScore: Number(overallScore.toFixed(2)),
        punctuality: averages.punctuality,
        Assignments: averages.Assignments,
        personalDefence: averages.personalDefense, 
        classParticipation: averages.classParticipation,
        classAssessment: averages.classAssessment
      };
    });

    // 2. Top Assignment Scorers (from AssignmentSubmission)
    // Get all graded submissions, populate assignment and student
    const submissionFilter = { status: "Graded" };
    // No need to filter AssignmentSubmission by stack, since students are already filtered
    const gradedSubs = await AssignmentSubmission.find({ status: "Graded", student: { $in: studentIds } })
      .populate({ path: "assignment", select: "title" })
      .populate({ path: "student", select: "name stack" });

    // Group by assignment
    const assignmentGroups = {};
    gradedSubs.forEach(sub => {
      const aid = sub.assignment?._id?.toString();
      if (!aid) return;
      if (!assignmentGroups[aid]) assignmentGroups[aid] = [];
      assignmentGroups[aid].push(sub);
    });

    // For each assignment, find the highest scorer (randomize if tie)
    const topAssignmentScorers = Object.values(assignmentGroups).map(subs => {
      if (subs.length === 0) return null;
      // Find max grade
      const maxGrade = Math.max(...subs.map(s => s.grade || 0));
      // Get all with max grade
      const topSubs = subs.filter(s => (s.grade || 0) === maxGrade);
      // Randomly pick one
      const winner = topSubs[Math.floor(Math.random() * topSubs.length)];
      return {
        title: winner.assignment?.title || "Untitled",
        name: winner.student?.name || "Unknown",
        totalScore: winner.grade
      };
    }).filter(Boolean);

    res.status(200).json({
      rankings,
      topAssignmentScorers
    });
  } catch (err) {
    next(ApiError.badRequest(err.message));
  }
};

const changePassword = async (req, res, next) => {
  try {
    const  userId  = req.user.id;
    const { currentPassword, newPassword } = req.body; 
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;
    await user.save();
    res.status(200).json({ message: "Password changed successfully" });
  } catch (err) {
    next(ApiError.badRequest(err.message));
  }
}

module.exports ={
  getProfile,
  createUser,
  deleteUser,
  getUser,
  getOneUser,
  updateUser,
  secondUpdate,
  getUsers,
  loginUser,
  makeAlumni,
  makeStudent,
  forgotPassword,
  resetPassword,
  updateAllUsersWeekStatus,
  resetWeeklyAssessments,
  allExistEmailsToLowerCase,
  studentDashboard,
  getDashboardStats,
  getAllStaffs,
  getAllStudents,
  getAllAlumnis,
  getSingleStudent,
  getSingleStaff,
  getSingleAlumni,
  getRankingsAndTopAssignments,
  changePassword
}
