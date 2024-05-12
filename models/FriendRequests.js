const { Schema, models, model } =require( "mongoose")

const FriendRequestsSchema = new Schema({
  userID:{
		type:Schema.Types.ObjectId,
		ref:"User"
	},
	friendRequests:[{ type: Schema.Types.ObjectId, ref: "User" }]
});

const FriendRequests = models.FriendRequests || model("FriendRequests", FriendRequestsSchema);
module.exports=FriendRequests