/*
  ChatGeek - Secure Programming Coursework
  Group: Group 99
  Members:
    - Finlay Bunt (Student ID: a1899706)
    - Akash Sapra (Student ID: a1941012)
    - Aditya Yadav (Student ID: a1961476)
    - Josh Harish (Student ID: a1886175)
    - Michelle Ngoc Bao Nguyen (Student ID: a1894969)
*/
const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const { fileStart, fileChunk, fileEnd } = require('../controllers/fileController');

router.post('/start', protect, fileStart);
router.post('/chunk', protect, fileChunk);
router.post('/end',   protect, fileEnd);

module.exports = router;
