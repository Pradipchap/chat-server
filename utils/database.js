const mongoose =require("mongoose")
let isConnected = false;

 async function connectToDB () {
  mongoose.set("strictQuery", true);

  if (isConnected) {
    console.log("MongoDB is already connected ");
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "Chat",
    });
    isConnected = true;
    console.log("MongoDB connected");
  } catch (error) {
    console.log("Error while connecting ", error);
  }
};

module.exports=connectToDB