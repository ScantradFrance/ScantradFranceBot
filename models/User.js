const mongoose = require("mongoose");
const findOrCreate = require('mongoose-findorcreate');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
        id: {
            type: String,
			index: { unique: true },
			required: true
        },
		follows: [{
			type: String
		}],
		all: {
			type: Boolean,
			default: false
		}
    }
);

UserSchema.plugin(findOrCreate);

module.exports = mongoose.model("user", UserSchema)
