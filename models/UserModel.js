const { Schema, models, model } =require( "mongoose")

const UserSchema = new Schema({
  email: {
    type: String,
    required: [true, "email is required"],
    unique: [true, "email already exists!!"],
  },
  image: {
    type: String,
  },
  username: {
    type: String,
    required: [true, "username is required"],
  },
  phone: {
    type: String,
  },
  dateofbirth: {
    type: Date,
  },
});

const User = models.User || model("User", UserSchema);
module.exports=User
