const verifyWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
};

const handleIncomingMessage = (req, res) => {
    console.log("Incoming Message Data:", JSON.stringify(req.body, null, 2));
    res.status(200).send('EVENT_RECEIVED');
};

module.exports = { verifyWebhook, handleIncomingMessage };