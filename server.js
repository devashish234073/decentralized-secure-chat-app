const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const cors = require('cors');
let PORT = 9999;
const app = express();
const encdec = require("./public/enc-dec");
console.log(encdec);

const corsOptions = {
    origin: '*',
    optionsSuccessStatus: 200
}

if(process.argv[2]) {
    PORT = parseInt(process.argv[2]);
}

app.use(cors(corsOptions));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let keys = null;
let tmr = setInterval(() => {
    if (encdec.getKeys) {
        keys = encdec.getKeys();
        if (keys && keys.publicKey) {
            init();
            clearInterval(tmr);
        }
    }
}, 100);
async function init() {
    console.log("enc-dec", await encdec.decrypt(await encdec.encrypt("Test Enc Dec From Server", keys.publicKey), keys.privateKey));
    app.listen(PORT, () => {
        console.log(`App is listening at http://localhost:${PORT}`);
    });
}

let uiPublicKey = null;
app.get('/publicKey', (req, res) => {
    console.log(req.query.uiPublicKey);
    if (!uiPublicKey) {
        uiPublicKey = req.query.uiPublicKey;
    } else {
        encdec.deletePublicKey();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(`{"publicKey":"${keys.publicKeyBase64}"}`);
});

app.post("/send-message", async (req, res) => {
    let message = req.body.message;
    console.log("decrypting",message);
    let decryptedMessage = await encdec.decrypt(message,keys.privateKey);
    let destination = req.body.destination;
    if(!destination || destination=="") {
        res.end(`{"message":"message, received by server. no destination provided."}`);
    } else {
        res.end(`{"message":"message sent to ${destination}"}`);
    }
});
