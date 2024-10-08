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
const log_enabled = true;
let messages = { "sent": {}, "received": {} };
log(encdec);

const corsOptions = {
    origin: '*',
    optionsSuccessStatus: 200
}

if (process.argv[2]) {
    PORT = parseInt(process.argv[2]);
}

let password = null;
if (process.argv[3]) {
    console.log("password argument is present");
    password = process.argv[3];
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
    log("enc-dec", await encdec.decrypt(await encdec.encrypt("Test Enc Dec From Server", keys.publicKey), keys.privateKey));
    const keyPath = path.join(__dirname, 'server.key');
    const certPath = path.join(__dirname, 'server.cert');
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        const options = {
            key: fs.readFileSync('server.key'),
            cert: fs.readFileSync('server.cert')
        };
        https.createServer(options, app).listen(PORT, () => {
            protocol = "https://";
            log(`Server running on https://localhost:${PORT}`);
        })
    } else {
        app.listen(PORT, () => {
            log(`App is listening at http://localhost:${PORT}`);
        });
    }
}

app.get("/hasPasswordForKeyExchange",(req,res)=>{
    res.end(`{"hasPassword":${password?true:false}}`);
});

let uiPublicKey = null;
app.post('/exchangePublicKey', async (req, res) => {
    let publicKeyRef = "";
    if (!uiPublicKey) {
        try {
            uiPublicKey = req.body.uiPublicKey;
            log("uiPublicKey", uiPublicKey);
            publicKeyRef = keys.publicKeyBase64;
            if(password) {
                uiPublicKey = await encdec.decryptUsingPassword(uiPublicKey,password);
                publicKeyRef = await encdec.encryptUsingPassword(publicKeyRef,password);
                console.log("ui publickey decrypted using password, server public key encrypted using password.");
                password = null;//its only required in the first call
            }
            encdec.deletePublicKey();
        } catch(error) {
            console.log("error while key exchange",error);
        }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(`{"publicKey":"${publicKeyRef}"}`);
});

app.post("/get-all-messages", async (req, res) => {
    let message = req.body.message;
    log("decrypting", message);
    let decryptedMessage = await encdec.decrypt(message, keys.privateKey);
    if (decryptedMessage == "i am the ui") {
        res.end(JSON.stringify(messages));
    } else {
        res.end(`{"message":"you are not the legitimate ui"}`);
    }
});

app.post("/send-message", async (req, res) => {
    let message = req.body.message;
    log("decrypting", message);
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
                    throw Error("Invalid destination ==> " + destination);
                }
            }
            try {
                const resp = JSON.parse(await restcalls.makeGetCall(https, host, port, "/getCommunicationPublicKey"));
                log("resp", resp);
                if (resp.communicationPublicKey) {
                    try {
                        let messageEncryptedUsingUIPublicKey = await encdec.encrypt(decryptedMessage, encdec.base64ToArrayBuffer(uiPublicKey));
                        let hostProcessed = processAddress(host);
                        let date = new Date();
                        let messageObj = {};
                        messageObj = [date.getTime(),messageEncryptedUsingUIPublicKey];
                        if (!messages["sent"][hostProcessed]) {
                            messages["sent"][hostProcessed] = [messageObj];
                        } else {
                            messages["sent"][hostProcessed].push(messageObj);
                        }
                        let messageEncryptedUsingRecipientPublicKey = await encdec.encrypt(decryptedMessage, encdec.base64ToArrayBuffer(resp.communicationPublicKey));
                        const msg_Send_resp = await restcalls.makePostCall(https, host, port, "/send-message-to-peer", { "message": messageEncryptedUsingRecipientPublicKey });
                        res.end(msg_Send_resp);
                    } catch (error) {
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
    log(`sending communication key to ${req.socket.remoteAddress} port ${req.socket.remotePort}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(`{"communicationPublicKey":"${communicationPublicKey}"}`);
});

app.post("/send-message-to-peer", async (req, res) => {
    let message = req.body.message;
    let sender = processAddress(req.socket.remoteAddress);
    try {
        if (!uiPublicKey) {
            res.end(`{"message":"recipient has not opened his app once"}`);
        } else {
            log("decrypting", message);
            let decryptedMessage = await encdec.decrypt(message, encdec.getCommunicationKeys().privateKey);
            log("decryptedMessage received", decryptedMessage);
            let messageEncryptedUsingUIPublicKey = await encdec.encrypt(decryptedMessage, encdec.base64ToArrayBuffer(uiPublicKey));
            let date = new Date();
            let messageObj = {};
            messageObj = [date.getTime(),messageEncryptedUsingUIPublicKey];
            if (messages["received"][sender]) {
                messages["received"][sender].push(messageObj);
            } else {
                messages["received"][sender] = [messageObj];
            }
            log(messages);
            res.end(`{"message":"ok ${sender}"}`);
        }
    } catch (error) {
        log("error receiving message from ", error);
        res.end(`{"message":"error"}`);
    }
});

function processAddress(address) {
    if (address.indexOf("127.0.0.1") > -1) {
        return "localhost";
    }
    return address.replace("::ffff:","");
}

function log(msg,param2) {
    if (log_enabled) {
        console.log((new Date()), msg);
        if(param2) {
            console.log((new Date()), param2);
        }
    }
}
