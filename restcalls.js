function makeGetCall(https, hostname ,port, apiPath) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: hostname,
            port: port,
            path: apiPath,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            rejectUnauthorized: false
        }
        const apiRequest = https.request(options, (apiResponse) => {
            let data = '';
            apiResponse.on('data', (chunk) => {
                data += chunk;
            });
            apiResponse.on('end', () => {
                resolve(data);
            });
        });
        apiRequest.on('error', (err) => {
            console.error('Error calling API:', err);
            reject('Error calling API');
        });
        apiRequest.end();
    });
}

async function makePostCall(https, hostname ,port, apiPath, postDataObj) {
    let postData = JSON.stringify(postDataObj);
    return new Promise((resolve, reject) => {
        const options = {
            hostname: hostname,
            port: port,
            path: apiPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            rejectUnauthorized: false
        };

        const apiRequest = https.request(options, (apiResponse) => {
            let data = '';

            apiResponse.on('data', (chunk) => {
                data += chunk;
            });

            apiResponse.on('end', () => {
                resolve(data);
            });
        });

        apiRequest.on('error', (err) => {
            reject(err);
        });

        apiRequest.write(postData);
        apiRequest.end();
    });
}

module.exports = {makeGetCall, makePostCall};