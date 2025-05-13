const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/,
      "Please enter a valid email address",
    ],
  },
  password: {
    type: String,
    required: [
      true,
      "Password must contain minimum 8 characters, one letter, and one number",
    ],
    validate: [
      {
        validator: function (value) {
          return value.length >= 8;
        },
        message: "Password should be minimum 8 characters long",
      },
      {
        validator: function (value) {
          return /[A-Za-z]/.test(value);
        },
        message: "Password must contain at least one letter",
      },
      {
        validator: function (value) {
          return /\d/.test(value);
        },
        message: "Password must contain at least one number",
      },
    ],
  },
});

// Pre-save hook to hash password
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("User", userSchema);
