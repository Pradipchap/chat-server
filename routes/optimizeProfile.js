async function optimizeProfileImage(image) {
  try {
    const x = await image.arrayBuffer();
    const buffer = Buffer.from(x);
    const optimizedImage = await sharp(buffer)
      .resize({ width: 100, height: 100 })
      .webp({ lossless: true })
      .toBuffer();
    return optimizedImage;
  } catch (error) {
    throw new Error("Error optimizing image");
  }
}

module.exports=optimizeProfileImage