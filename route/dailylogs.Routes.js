// import express from 'express';
// import { saveChatMessage, getChatLogs } from '../controller/chatLogController.js';
// // import { protect } from '../middleware/authMiddleware.js';
// const router = express.Router();


// router.route('/').post( saveChatMessage).get( getChatLogs);
// router.route('/').post( createDiaryEntry).get( getDiaryEntries);
// export default router;



import express from 'express';
import {
  createDiaryEntry,
  getMyDiaryEntries,
  getDiaryEntryById,
  updateDiaryEntry,
  deleteDiaryEntry,
} from '../controller/dailyDiary.Controller.js';
import { protect } from '../middleware/auth.middleware.js';


const router = express.Router();

router.use(protect);

router.route('/')
    .post(createDiaryEntry)
    .get(getMyDiaryEntries);

router.route('/:id')
    .get(getDiaryEntryById)
    .put(updateDiaryEntry)
    .delete(deleteDiaryEntry);


export default router;