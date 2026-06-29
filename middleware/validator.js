const joi =  require  ('@hapi/joi');

const validateUser = (data) => {
    try {
        const validateSchema = joi.object({
            firstName: joi.string().min(3).max(30).regex(/^[a-zA-Z]+$/).trim().required().messages({
                'string.empty': "First name field can't be left empty",
                'string.min': "Minimum of 3 characters for the first name field",
                'any.required': "Please first name is required"
            }),
            lastName: joi.string().min(3).max(30).regex(/^[a-zA-Z]+$/).trim().required().messages({
                'string.empty': "Last name field can't be left empty",
                'string.min': "Minimum of 3 characters for the last name field",
                'any.required': "Please last name is required"
            }),
            email: joi.string().max(40).trim().email( {tlds: {allow: false} } ).required().messages({
                'string.empty': "Email field can't be left empty",
                'any.required': "Please Email is required"
            }),
            password: joi.string().min(8).max(20).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/).trim().required().messages({
                'string.empty': "Password field can't be left empty",
                'string.pattern.base': 'Password must contain Lowercase, Uppercase, Numbers, and special characters',
                'string.min': "Password must be at least 8 characters long",
                'any.required': "Please password field is required"
            }),
        })
        return validateSchema.validate(data);
    } catch (error) {
            throw new Error("Error while validating user: " + error.message)
    }
}


const validateUserLogin = (data) => {
    try {
        const validateSchema = joi.object({
            email: joi.string().max(40).trim().email( {tlds: {allow: false} } ).messages({
                'string.empty': "Email field can't be left empty",
                'any.required': "Please Email is required"
            }),
            userName: joi.string().min(3).max(30).alphanum().trim().messages({
                'string.empty': "Username field can't be left empty",
                'string.min': "Minimum of 3 characters for the username field",
                'any.required': "Please username is required"
            }),
            password: joi.string().min(8).max(20).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/).trim().required().messages({
                'string.empty': "Password field can't be left empty",
                'string.pattern.base': 'Password must contain Lowercase, Uppercase, Numbers, and special characters',
                'string.min': "Password must be at least 8 characters long",
                'any.required': "Please password field is required"
            }),
        })
        return validateSchema.validate(data);
    } catch (error) {
            throw new Error("Error while validating user: " + error.message)
    }
}


const validateUserLocation = (data) => {
    try {
        const validateSchema = joi.object({
            location: joi.string().min(3).max(30).regex(/^[A-Za-z]+(?: [A-Za-z]+)*$/).trim().required().messages({
                'string.empty': "location field can't be left empty",
                'string.min': "Minimum of 3 characters for the location field",
                'any.required': "Please location is required"
            })
        })
        return validateSchema.validate(data);
    } catch (error) {
            throw new Error("Error while validating user: " + error.message)
    }
}



 const validateStudent = (data) => {
  const schema = joi.object({
    name: joi.string()
      .trim()
      .min(2)
      .max(50)
      .required()
      .messages({
        "string.empty": "Name is required",
        "string.min": "Name must be at least 2 characters",
        "string.required":" Name is required"
      }),

    email: joi.string()
      .trim()
      .email()
      .lowercase()
      .required()
      .messages({
        "string.email": "Invalid email format",
        "string.empty": "Email is required",
      }),

    phone: joi.string()
      .pattern(/^[0-9]{10,15}$/)
      .required()
      .messages({
        "string.pattern.base":
          "Phone must be between 10–15 digits",
      }),

    stack: joi.string()
      .valid("backend", "frontend", "product design")
      .required()
      .messages({
        "any.only": "Stack must be backend, frontend or product design",
      }),

    password: joi.string()
      .min(8)
      .required()
      .messages({
        "string.min": "Password must be at least 8 characters",
      }),

    hub: joi.string()
     .valid("hq","festac")
      .required()
      .messages({
        "any.only": "Hub must be Hq or Festac",
      }),
  });

  return schema.validate(data,);
};
const validateLogin = (data) => {
  const schema = joi.object({
    email: joi.string()
      .trim()
      .email()
      .required()
      .messages({
        "string.empty": "Email is required",
        "string.email": "Enter a valid email",
      }),

    password: joi.string()
      .required()
      .messages({
        "string.empty": "Password is required",
      }),
  });

  return schema.validate(data); 
}

const validateRegistration = (data) => {
  const schema = joi.object({
    learningMode: joi
      .string()
      .valid("physical", "virtual")
      .required()
      .messages({
        "any.only": 'learningMode must be "physical" or "virtual"',
        "string.empty": "Learning mode is required",
      }),

    firstName: joi
      .string()
      .trim()
      .min(2)
      .required()
      .messages({
        "string.empty": "First name is required",
        "string.min": "First name must be at least 2 characters",
      }),

    lastName: joi
      .string()
      .trim()
      .min(2)
      .required()
      .messages({
        "string.empty": "Last name is required",
        "string.min": "Last name must be at least 2 characters",
      }),

    email: joi
      .string()
      .trim()
      .email()
      .lowercase()
      .required()
      .messages({
        "string.email": "Invalid email format",
        "string.empty": "Email is required",
      }),

    phone: joi
      .string()
      .pattern(/^[0-9]{10,15}$/)
      .required()
      .messages({
        "string.pattern.base": "Phone must be between 10–15 digits",
        "string.empty": "Phone is required",
      }),

    gender: joi.string().trim().min(1).required().messages({
      "string.empty": "Gender is required",
    }),

    age: joi.string().trim().min(1).required().messages({
      "string.empty": "Age is required",
    }),

    address: joi.string().trim().min(1).required().messages({
      "string.empty": "Address is required",
    }),

    country: joi
      .string()
      .trim()
      .when("learningMode", {
        is: "virtual",
        then: joi.string().trim().min(1).required().messages({
          "string.empty": "Country is required for virtual learning",
        }),
        otherwise: joi.string().trim().allow("").optional(),
      }),

    occupation: joi.string().trim().min(1).required().messages({
      "string.empty": "Occupation is required",
    }),

    education: joi.string().trim().min(1).required().messages({
      "string.empty": "Education is required",
    }),

    ownLaptop: joi
      .string()
      .trim()
      .when("learningMode", {
        is: "physical",
        then: joi.string().trim().min(1).required().messages({
          "string.empty": "Own laptop is required for physical learning",
        }),
        otherwise: joi.string().trim().allow("").optional(),
      }),

    stack: joi.string().trim().min(1).required().messages({
      "string.empty": "Stack is required",
    }),

    whyStack: joi
      .string()
      .trim()
      .when("learningMode", {
        is: "physical",
        then: joi.string().trim().min(1).required().messages({
          "string.empty": "Why stack is required for physical learning",
        }),
        otherwise: joi.string().trim().allow("").optional(),
      }),

    whyConsider: joi
      .string()
      .trim()
      .when("learningMode", {
        is: "physical",
        then: joi.string().trim().min(1).required().messages({
          "string.empty": "Why consider is required for physical learning",
        }),
        otherwise: joi.string().trim().allow("").optional(),
      }),

    hearAbout: joi.string().trim().min(1).required().messages({
      "string.empty": "Hear about is required",
    }),
  });

  return schema.validate(data);
};

module.exports = {
    validateUser,
    validateUserLogin,
    validateUserLocation,
    validateStudent,
    validateLogin,
    validateRegistration,
}