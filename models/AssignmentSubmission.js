const mongoose = require("mongoose");

const assignmentSubmissionSchema = new mongoose.Schema({
    assignment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Assignment",
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SOWusers",
        required: true
    },
    submissionLink: {
        type: String,
        required: true,
        validate: {
            validator: function(v) {
                return /^https?:\/\/.+/.test(v);
            },
            message: 'Please provide a valid URL'
        }
    },
    feedback: {
        type: String,
        trim: true, 
    },
    status: {
        type: String,
        enum: ["Pending", "Graded"],
        default: "Pending"
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    isLate: {
        type: Boolean,
        default: false
    },
    grade: {
        type: Number,
        min: 0,
        max: 20
    },
    // One mark per assignment criterion. Empty when the assignment has no rubric;
    // when it does, grade is the sum of these scores.
    criterionScores: [{
        criterion: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        score: {
            type: Number,
            required: true,
            min: 0
        }
    }]
}, {
    timestamps: true
});

// Ensure one submission per student per assignment
assignmentSubmissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

module.exports = mongoose.model("AssignmentSubmission", assignmentSubmissionSchema);