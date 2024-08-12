const mongoose =require("mongoose")
const dotenv=require("dotenv").config();
const Mongoose =mongoose.Mongoose;

let isConnected = false;
let x = null;
connectToDB = async () => {
  mongoose.set("strictQuery", true);

  if (isConnected) {
    return x;
  }
  try {
    x = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "Chat",
    });
    isConnected = true;
    return x;
  } catch (error) {
    return null;
  }
};
module.exports=connectToDB