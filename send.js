const { google } = require('googleapis');
const csv = require('csv-parser');
const fs = require('fs');
const privateKey = require('./cred.json');

// Function to send email
const _send = (user, to, from, subject,htmlContent) => {
    console.log('Sending email to: ' + to);

    const jwtClient = new google.auth.JWT(
        privateKey.client_email,
        null,
        privateKey.private_key,
        ['https://mail.google.com/'],
        user
    );

    jwtClient.authorize(function (err, tokens) {
        if (err) {
            console.log(err);
            return;
        }

        const gmail = google.gmail({ version: 'v1', auth: jwtClient });

        const raw = Buffer.from(
            `Content-Type: text/html; charset="UTF-8"\n` +
            "From: "+from+" <"+user+">\n" +
            `To: ${to}\n` +
            `Subject: ${subject}\n\n` +
            htmlContent,
            'utf-8'
        ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

        gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw }
        }, (err, res) => {
            if (err) {
                console.error(err);
            } else {
                console.log('Email sent successfully');
            }
        });
    });
};

// Function to read CSV files
const readCsv = async () => {
    const users = [];
    const data = [];

    await new Promise(resolve => {
        fs.createReadStream('files/users.csv')
            .pipe(csv())
            .on('data', (row) => {
                users.push(row.email);
            })
            .on('end', () => {
                console.log('Users CSV file successfully processed', users.length);
                resolve();
            });
    });

    await new Promise(resolve => {
        fs.createReadStream('files/data.csv')
            .pipe(csv())
            .on('data', (row) => {
                data.push(row.to);
            })
            .on('end', () => {
                console.log('Data CSV file successfully processed', data.length);
                resolve();
            });
    });

    return { users, data };
};

function getEmailInfo(callback) {
    let htmlContent = '';
    let from = '';
    let subject = '';

    fs.readFile('files/html.txt', 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading html.txt:', err);
            callback(err, null);
            return;
        }
        console.log('html.txt:', data);
        htmlContent = data.trim();


        fs.createReadStream('files/info.csv')
            .pipe(csv())
            .on('data', (row) => {
                if (row.from && row.subject) {
                    from = row.from.trim();
                    subject = row.subject.trim();
                }
            })
            .on('end', () => {
                callback(null, { htmlContent, from, subject })                
            });
    });
}


// Function to send emails to users
const sendEmails = async (num_emails) => { 
    getEmailInfo((err, { htmlContent, from, subject }) => {
        if (err) {
            console.error('Error getting email info:', err);
            return;
        }
        readCsv().then(({ users, data }) => {
            let dataIndex = 0;

            usersLoop:
            for (let user of users) {
                for (let j = 0; j < num_emails; j++, dataIndex++) {
                    if (dataIndex >= data.length) {
                        break usersLoop;
                    }
                    _send(user, data[dataIndex], from, subject, htmlContent);
                }
            }
        }).catch(err => {
            console.error('Error reading CSV:', err);
        });       
    });
};

sendEmails(1).catch(console.error);
