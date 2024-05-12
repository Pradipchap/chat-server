const { Schema, model, models } = require("mongoose");

const messageSchema = new Schema({
  message: { type: String, required: true },
  datetime: { type: Date, default: Date.now },
  sender:{type:Schema.Types.ObjectId,ref:"User"}
});

const conversationSchema = new Schema({
  combinedID: { type: String, required: true,unique:true },
  participants:[{type:Schema.Types.ObjectId,ref:"User"}],
  messages: [messageSchema]
}, { timestamps: true }); // Automatically add createdAt and updatedAt fields

const Convo = models.Convo || model("Convo", conversationSchema);
module.exports = Convo;