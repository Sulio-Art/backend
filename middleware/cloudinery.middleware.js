import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
    cloud_name:"dusvarmgw",
    api_key: 373154371666665,
    api_secret: "0wl4BSfkmJ-EY6De1F7-0etfWhg",
});

const storage = multer.memoryStorage();
export const upload = multer({ storage });


export default cloudinary;
