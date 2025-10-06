const mongoose = require("mongoose");

const groupSchema = mongoose.Schema(
  {
    group_id: {
      type: String,
      required: true,
      unique: true,
    },
    creator_id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    meta: {
      avatar_url: String,
      description: String,
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

const Group = mongoose.model("Group", groupSchema);
module.exports = Group;
