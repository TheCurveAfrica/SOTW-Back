const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    learningMode: {
      type: String,
      enum: ["physical", "virtual"],
      required: true,
    },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true },
    gender: { type: String, required: true },
    age: { type: String, required: true },
    address: { type: String, required: true },
    occupation: { type: String, required: true },
    education: { type: String, required: true },
    ownLaptop: { type: String, default: "" },
    stack: { type: String, required: true },
    whyStack: { type: String, required: true },
    whyConsider: { type: String, default: "" },
    hearAbout: { type: String, required: true },
    sheetSynced: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Registration = mongoose.model("Registration", registrationSchema);

module.exports = Registration;
