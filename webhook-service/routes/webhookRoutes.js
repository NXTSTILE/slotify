const express = require('express');
const router = express.Router();
const { verifyWebhook, handleIncomingMessage } = require('../controllers/webhookController');

router.get('/whatsapp', verifyWebhook);
router.post('/whatsapp', handleIncomingMessage);

module.exports = router;