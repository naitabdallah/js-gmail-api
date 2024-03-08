const fs = require('fs');
const csv = require('csv-parser');
const { google } = require('googleapis');
const privateKey = require('./cred.json');

// Function to create users in Google Admin
const createUser = (user, password, firstname, lastname, callback) => {
    const jwtClient = new google.auth.JWT(
        privateKey.client_email,
        null,
        privateKey.private_key,
        ['https://www.googleapis.com/auth/admin.directory.user'],
        'admin@beastman.pro'
    );

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
        console.log('Creating user:', user, 'with password:', password, 'and name:', firstname, lastname);
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
                console.log('User created successfully:', res.data);
                callback(null, res.data);
            }
        });
    });
};

fs.createReadStream('files/user_to_create.csv')
    .pipe(csv())
    .on('data', (row) => {
        const user = row.user;
        const password = row.password;
        const firstname = row.firstname;
        const lastname = row.lastname;
        console.log('Creating user:', user);
        createUser(user, password, firstname, lastname, (err, result) => {
            if (err) {
                console.error('Error creating user:', err);
            } else {
                console.log('User created successfully:', result);
            }
        });
    });