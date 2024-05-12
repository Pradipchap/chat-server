const { Schema, models, model } =require( "mongoose")

const EachFriendSchema=new Schema({
	userID:{type:Schema.Types.ObjectId,ref:"User"},
	convoID:{type:Schema.Types.ObjectId,ref:"Convo"}
})

const FriendsSchema = new Schema({
  userID:{
		type:Schema.Types.ObjectId,
		ref:"User"
	},
	friends:[EachFriendSchema]
});

const Friends = models.Friends || model("Friends", FriendsSchema);
module.exports=Friends