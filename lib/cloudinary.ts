// Import the cloudinary library
import cloudinary from "cloudinary";

const cloudinaryV2 = cloudinary.v2;

cloudinaryV2.config({
  secure: true,
});

console.log(cloudinaryV2.config());

export default cloudinaryV2;
