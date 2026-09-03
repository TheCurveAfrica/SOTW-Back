const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
date: {
    type: String,
},
time: {
    type: String,
},
location: {
    type: String,
},
image: {
    url: {
        type: String,
    },
    public_id: {
        type: String,
    },
},
punctualityScore: {
    type: Number,
},
// "excused" rows are written by an approved class-day exception request, not by
// a check-in: they have no time and no image. They exist so an excused absence
// shows up in attendance history as excused rather than as an unexplained gap.
// Every average over this collection MUST skip them - see the reduce() guards in
// controllers/punctualityController.js - or the 0 above drags the score down,
// which is the exact opposite of being excused.
status: {
    type: String,
    enum: ['present', 'excused'],
    default: 'present',
},
userId: [{
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'SOWuser',
}], 
}, {timestamps: true});

const dataModel = mongoose.model('Data', dataSchema);

// dataSchema.pre('save', function(next) {
//     const self = this;
//     dataModel.findOne({
//       userId: self.userId,
//       createdAt: {
//         $gte: new Date(new Date().setHours(0, 0, 0, 0)),
//         $lt: new Date(new Date().setHours(23, 59, 59, 999))
//       }
//     }, function(err, existingUser) {
//       if (existingUser) {
//         return next(new Error('You can\'t sign in more than once today'));
//       } else {
//         next();
//       }
//     });
//   });

module.exports = dataModel;