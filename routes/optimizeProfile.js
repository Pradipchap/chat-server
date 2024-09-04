const sharp=require("sharp");

async function optimizeProfileImage(image) {
  try {
    const x = await image.buffer;
    const buffer = Buffer.from(x);
    const optimizedImage = await sharp(buffer)
      .resize({ width: 100, height: 100 })
      .webp({ lossless: true })
      .toBuffer();
    return optimizedImage;
  } catch (error) {
    //console.log("error is",error)
    throw new Error("Error optimizing image");
  }
}

module.exports=optimizeProfileImage