const mongoose = require("mongoose");

// A rubric splits the assignment's 0-20 score. An empty list means the tutor
// still enters one score. When the list is present, the controller requires
// the maxima to add up to 20.
const criterionSchema = new mongoose.Schema({
    label: {
        type: String,
        required: true,
        trim: true
    },
    maxPoints: {
        type: Number,
        required: true,
        min: 0
    }
});

const assignmentSchema = new mongoose.Schema({
    week: {
        type: Number,
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    taskDescription: {
        type: String,
        required: true
    },
    // "text" for legacy plain-text descriptions, "html" for rich-text ones.
    // Defaults to "text" so existing assignments stay correct without a migration.
    descriptionFormat: {
        type: String,
        enum: ["text", "html"],
        default: "text"
    },
    stack: {
        type: String,
        required: true,
        enum: ["Front End", "Back End", "Product Design", 'General']
    },
    dueDateTime: {
        type: Date,
        required: true
    },
    allowLateSubmissions: {
        type: Boolean,
        default: false
    },
    criteria: {
        type: [criterionSchema],
        default: []
    },
}, {
    timestamps: true
});

// Index for efficient querying
assignmentSchema.index({ week: 1, stack: 1 });

module.exports = mongoose.model("Assignment", assignmentSchema);