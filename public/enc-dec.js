let publicKey, privateKey, publicKeyBase64, privateKeyBase64;
async function generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: { name: "SHA-256" },
        },
        true,
        ["encrypt", "decrypt"]
    );

    publicKey = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    privateKey = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    publicKeyBase64 = arrayBufferToBase64(publicKey);
    privateKeyBase64 = arrayBufferToBase64(privateKey);
}
generateKeyPair();

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function deletePublicKey() {
    publicKey = null;
    publicKeyBase64 = "";
}

function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

async function encrypt(text,publicKeyArg) {
    const encoder = new TextEncoder();
    const encodedMessage = encoder.encode(text);
    let publicKeyToUse = await getPublicKeyToUse(publicKeyArg);
    const encrypted = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        publicKeyToUse,
        encodedMessage
    );
    const encryptedBase64 = arrayBufferToBase64(encrypted);
    return encryptedBase64;
}

async function decrypt(text,privateKeyArg) {
    const encryptedArrayBuffer = base64ToArrayBuffer(text);
    let privateKeyToUse = await getPrivateKeyToUse(privateKeyArg);
    const decrypted = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKeyToUse,
        encryptedArrayBuffer
    );
    const decoder = new TextDecoder();
    const decryptedMessage = decoder.decode(decrypted);
    return decryptedMessage;
}

async function getPublicKeyToUse(publicKeyArg) {
    return await crypto.subtle.importKey(
        "spki",
        publicKeyArg,
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["encrypt"]
    );
}

async function getPrivateKeyToUse(privateKeyArg) {
    return await crypto.subtle.importKey(
        "pkcs8",
        privateKeyArg,
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["decrypt"]
    );
}

function getKeys() {
    return {"publicKey":publicKey, "privateKey":privateKey, "publicKeyBase64":publicKeyBase64, "privateKeyBase64":privateKeyBase64};
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = {
        encrypt,
        decrypt,
        getKeys,
        deletePublicKey
    };
}