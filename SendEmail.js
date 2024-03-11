const express = require('express');
const { google } = require('googleapis');
const csv = require('csv-parser');
const fs = require('fs');
const axios = require('axios');
const privateKey = require('./cred.json');

const app = express();
const port = 3000;

app.use(express.json());

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const QUOTA_LIMIT = 1200000;
const REQUESTS_PER_EMAIL = 50;
const INTERVAL = 60000 / QUOTA_LIMIT;
const CONCURRENT_USERS = 200;

let successfulEmails = 0;
let requestCount = 0;
let dataIndex = 0;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const _send = async (user, to, from, subject, htmlContent, retries = MAX_RETRIES) => {
    const jwtClient = new google.auth.JWT(
        privateKey.client_email, null, privateKey.private_key, ['https://mail.google.com/'], user
    );

    const tokens = await jwtClient.authorize();
    if (!tokens) {
        console.log('Failed to authorize');
        return;
    }

    const raw = Buffer.from(
        `Content-Type: text/html; charset="UTF-8"\nFrom: ${from} <${user}>\nTo: ${to}\nSubject: ${subject}\n\n${htmlContent}`,
        'utf-8'
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

    const url = 'https://www.googleapis.com/gmail/v1/users/me/messages/send';
    const headers = { 'Authorization': `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' };
    const data = { raw };

    try {
        await axios.post(url, data, { headers });
        console.log(`Message sent: ${successfulEmails}`);
        successfulEmails++;
    } catch (error) {
        if (retries > 0) {
            console.log(`Failed to send email, retrying... Retries left: ${retries}`);
            await sleep(RETRY_DELAY);
            await _send(user, to, from, subject, htmlContent, retries - 1);
        } else {
            console.error('Failed to send email after retries:', error);
        }
    }
};

const readCsv = async (filePath) => {
    const items = [];
    await new Promise(resolve => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => items.push(row))
            .on('end', () => {
                console.log(`${filePath} successfully processed, ${items.length} items`);
                resolve(items);
            });
    });
    return items;
};

const sendEmailBatch = async (users, data, info, htmlContent) => {
    const { from, subject } = info[0];
    const emailTasks = users.map(user => 
        Array.from({ length: REQUESTS_PER_EMAIL }, async () => {
            if (dataIndex >= data.length) return;
            const startTime = Date.now();
            await _send(user.email, data[dataIndex].to, from, subject, htmlContent);
            const elapsedTime = Date.now() - startTime;
            requestCount++;
            const delay = INTERVAL * requestCount - elapsedTime;
            if (delay > 0) await sleep(delay);
            dataIndex++;
        })
    );

    await Promise.all(emailTasks.flat());
};

const sendEmails = async () => {
    const users = await readCsv('files/users.csv');
    const data = await readCsv('files/data.csv');
    const info = await readCsv('files/info.csv');
    const htmlContent = fs.readFileSync('files/html.txt', 'utf8').trim();

    for (let i = 0; i < users.length; i += CONCURRENT_USERS) {
        const batchUsers = users.slice(i, i + CONCURRENT_USERS);
        await sendEmailBatch(batchUsers, data, info, htmlContent);
    }

    console.log('All emails sent successfully.', successfulEmails);
};

app.get('/send-emails', async (req, res) => {
    try {
        await sendEmails();
        res.status(200).send('Emails are being sent.');
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while sending emails.');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
