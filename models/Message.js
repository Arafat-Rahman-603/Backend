const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  user: { type: String, required: true }, // Clerk username
  text: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);
