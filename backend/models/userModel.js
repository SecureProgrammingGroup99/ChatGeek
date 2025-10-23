/*
  ChatGeek - Secure Programming Coursework
  Group: Group 99
  Members:
    - Finlay Bunt (Student ID: a1899706)
    - Akash Sapra (Student ID: a1941012)
    - Aditya Yadav (Student ID: a1961476)
    - Josh Harish (Student ID: a1886175)
    - Michelle Ngoc Bao Nguyen (Student ID: a1894969)
*/
const mongoose = require("mongoose");

const PakePasswordSchema = new mongoose.Schema({
  scheme:   { type: String, enum: ['srp-6a'], required: true },
  group:    { type: String, enum: ['rfc5054-4096'], required: true },
  g:        { type: Number, enum: [5], required: true },
  hash:     { type: String, enum: ['SHA-256'], required: true },
  salt:     { type: String, required: true },     // base64url (no padding)
  verifier: { type: String, required: true },     // base64url (no padding)
  k:        { type: String, enum: ['derived'], required: true },
  version:  { type: Number, default: 1 },
}, { _id: false });

const userSchema = mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      unique: true, // internal UUID
    },
    login_email: {
      type: String,
      required: true,
      unique: true, // user-typed email for login
    },
    pubkey: {
      type: String,
      required: true,
    },
    privkey_store: {
      type: String,
      required: true,
    },
    pake_password: {
      type: String,
      required: true,
    },
    meta: {
      display_name: String,
      pronouns: String,
      age: Number,
      avatar_url: String,
      extras: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);
module.exports = User;
