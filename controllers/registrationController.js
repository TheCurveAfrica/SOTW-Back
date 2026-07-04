const Registration = require("../models/Registration");
const ApiError = require("../error/ApiError");
const { validateRegistration } = require("../middleware/validator");
const { appendRegistrationRow } = require("../utils/sheetClient");
const sendMail = require("../utils/email");
const {
  generateRegistrationConfirmationEmail,
} = require("../utils/registrationEmail");

const REGISTRATION_FIELDS = [
  "learningMode",
  "firstName",
  "lastName",
  "email",
  "phone",
  "gender",
  "age",
  "address",
  "country",
  "occupation",
  "education",
  "ownLaptop",
  "stack",
  "whyStack",
  "whyConsider",
  "hearAbout",
];

const register = async (req, res, next) => {
  try {
    const { error } = validateRegistration(req.body);
    if (error) {
      return next(ApiError.badRequest(error.details[0].message));
    }

    const data = Object.fromEntries(
      REGISTRATION_FIELDS.map((field) => [field, req.body[field]])
    );

    let registration = await Registration.findOne({ email: data.email });

    if (registration) {
      if (registration.sheetSynced) {
        return next(
          ApiError.conflict("You have already registered with this email.")
        );
      }
    } else {
      registration = await Registration.create(data);
    }

    try {
      await appendRegistrationRow(data);
    } catch (err) {
      console.error("Sheet write failed:", err);
      return res
        .status(502)
        .json({ error: "Could not save registration. Please retry." });
    }

    registration.sheetSynced = true;
    await registration.save();

    const html = generateRegistrationConfirmationEmail(data.firstName);
    const mailResult = await sendMail({
      email: data.email,
      subject: "Registration Successful",
      html,
    });

    if (!mailResult.success) {
      console.error(
        "Registration confirmation email failed:",
        mailResult.message
      );
    }

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { register };
