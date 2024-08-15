const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
let PORT = 9999;
const app = express();
const encdec = require("./public/enc-dec");
const restcalls = require("./restcalls");
console.log(encdec);

const corsOptions = {
    origin: '*',
    optionsSuccessStatus: 200
}

if (process.argv[2]) {
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
let protocol = "http://";
async function init() {
    console.log("enc-dec", await encdec.decrypt(await encdec.encrypt("Test Enc Dec From Server", keys.publicKey), keys.privateKey));
    const keyPath = path.join(__dirname, 'server.key');
    const certPath = path.join(__dirname, 'server.cert');
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        const options = {
            key: fs.readFileSync('server.key'),
            cert: fs.readFileSync('server.cert')
        };
        https.createServer(options, app).listen(PORT, () => {
            protocol = "https://";
            console.log(`Server running on https://localhost:${PORT}`);
        })
    } else {
        app.listen(PORT, () => {
            console.log(`App is listening at http://localhost:${PORT}`);
        });
    }
}

let uiPublicKey = null;
app.get('/exchangePublicKey', (req, res) => {
    console.log(req.query.uiPublicKey);
    let publicKeyRef = "";
    if (!uiPublicKey) {
        uiPublicKey = req.query.uiPublicKey;
        publicKeyRef = keys.publicKeyBase64;
        encdec.deletePublicKey();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(`{"publicKey":"${publicKeyRef}"}`);
});

app.post("/send-message", async (req, res) => {
    let message = req.body.message;
    console.log("decrypting", message);
    let decryptedMessage = await encdec.decrypt(message, keys.privateKey);
    let destination = req.body.destination;
    if (!destination || destination == "") {
        res.end(`{"message":"message received by server. no destination provided."}`);
    } else {
        try {
            let host = "";
            let port = 0;
            if (destination.indexOf(":") == -1) {
                host = destination;
                port = PORT;
            } else {
                let destinationSplit = destination.split(":");
                if (destinationSplit.length == 2) {
                    host = destinationSplit[0];
                    port = parseInt(destinationSplit[1]);
                } else {
                    throw Error("Invalid destination ==> "+destination);
                }
            }
            try {
                const resp = JSON.parse(await restcalls.makeGetCall(https, host, port, "/getCommunicationPublicKey"));
                console.log("resp",resp);
                if(resp.communicationPublicKey) {
                    try {
                        let messageEncryptedUsingRecipientPublicKey = await encdec.encrypt(decryptedMessage, encdec.base64ToArrayBuffer(resp.communicationPublicKey));
                        const msg_Send_resp = JSON.parse(await restcalls.makePostCall(https, host, port, "/send-message-to-peer",{"message":messageEncryptedUsingRecipientPublicKey}));
                        res.end(`{"message":"ok ${msg_Send_resp}"}`);
                    } catch(error) {
                        res.end(`{"message":"Unable to encrypt using receipients public key '${error}'"}`);
                    }
                } else {
                    res.end(`{"message":"Unable to get communication key of the destination provided"}`);
                }
            } catch (error) {
                res.end(`{"message":"Unable to get communication key of the destination provided '${error}'"}`);
            }
        } catch (error) {
            res.end(`{"message":"error ${error}"}`);
        }
    }
});

app.get('/getCommunicationPublicKey', (req, res) => {
    let communicationPublicKey = encdec.getCommunicationKeys().publicKeyBase64;
    console.log(`sending communication key to ${req.socket.remoteAddress} port ${req.socket.remotePort}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(`{"communicationPublicKey":"${communicationPublicKey}"}`);
});

let messages = {};

app.post("/send-message-to-peer", async (req, res) => {
    let message = req.body.message;
    let sender = req.socket.remoteAddress;
    try {
        if(!uiPublicKey) {
            res.end(`{"message":"recipient has not opened his app once"}`);
        } else {
            console.log("decrypting", message);
            let decryptedMessage = await encdec.decrypt(message, encdec.getCommunicationKeys().privateKey);
            console.log("decryptedMessage received",decryptedMessage);
            let messageEncryptedUsingUIPublicKey = await encdec.encrypt(decryptedMessage, encdec.base64ToArrayBuffer(uiPublicKey));
            if(messages[sender]) {
                messages[sender].push(messageEncryptedUsingUIPublicKey);
            } else {
                messages[sender] = [messageEncryptedUsingUIPublicKey];
            }
            res.end(`{"message":"ok ${sender}"}`);
        }
    } catch(error) {
        console.log("error receiving message from ",error);
        res.end(`{"message":"error"}`);
    }
});
