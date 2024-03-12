const fs = require('fs');
const csv = require('csv-parser');
const { google } = require('googleapis');
const privateKey = require('./cred.json');


const jwtClient = new google.auth.JWT(
    privateKey.client_email,
    null,
    privateKey.private_key,
    ['https://www.googleapis.com/auth/admin.directory.user'],
    'admin-info@gertime.online'
);


function createUser(user, password, firstname, lastname, callback) {
    jwtClient.authorize(function (err, tokens) {
        if (err) {
            console.error(err);
            callback(err, null);
            return;
        }

        const admin = google.admin({
            version: 'directory_v1',
            auth: jwtClient
        });
        admin.users.insert({
            auth: jwtClient,
            resource: {
                primaryEmail: user,
                password: password,
                name: {
                    givenName: firstname,
                    familyName: lastname
                }
            }
        }, (err, res) => {
            if (err) {
                console.error('Error creating user:', err);
                callback(err, null);
            } else {
                console.log('User created successfully:');
                callback(null, res.data);
            }
        });
    });
};

let queue = [];
let isProcessing = false;

fs.createReadStream('files/user_list.csv')
    .pipe(csv())
    .on('data', (row) => {
        queue.push(row);
    });

function processQueue() {
    if (queue.length === 0) {
        isProcessing = false;
        return;
    }

    isProcessing = true;
    const row = queue.shift();
    const user = row.user;
    const password = row.password;
    const firstname = row.firstname;
    const lastname = row.lastname;

    createUser(user, password, firstname, lastname, (err, result) => {
        if (err) {
            console.error('Error creating user:', err);
        } else {
            console.log('User created successfully:', result);
        }

        setTimeout(processQueue, 1);
    });
}

setInterval(() => {
    if (!isProcessing) {
        processQueue();
    }
}, 5);