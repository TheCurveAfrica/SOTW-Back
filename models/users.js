const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: {type: String, required: true},
    image: {type: String, required: true},
    imageId: {type: String, required: true},
    email: {type: String, required: true, unique: true},
    phone: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    stack: {type:String, required: true},
    role: {type: String},
    cohort: {type: Number, required: true},  
    allRatings:[{
      type: mongoose.Schema.Types.ObjectId, ref: "ratings"
    }],  
    assignments:  [{
      type: mongoose.Schema.Types.ObjectId, ref: "AssignmentSubmission"
    }], 
    bio:{type:String},
    overallRating: {type: Number},
    weeklyRating: {type: Number},
    nominated: {type: Boolean, default: false},
    studentOfTheWeek: {type: Boolean, default: false},
    bStudentOfTheWeek: {type: Boolean, default: false},
    position: {type: String},
    hub: {type: String},
    bio: {type: String},
    week: {type: String, default: 0},
    assessedForTheWeek: {type: Boolean, default: false}
}, {timestamps:true});

const userModel = mongoose.model("SOWusers", userSchema);

module.exports = userModel;