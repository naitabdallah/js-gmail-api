const { google } = require('googleapis');
const csv = require('csv-parser');
const fs = require('fs');
const privateKey = require('./cred.json');
const axios = require('axios');

const QUOTA_LIMIT = 1200000;
const REQUESTS_PER_EMAIL = 100; // Increase the number of requests per email for higher concurrency
const INTERVAL = 60000 / QUOTA_LIMIT; // Interval between each request to meet the quota limit
const CONCURRENT_USERS = 200; // Increase the number of concurrent users to utilize full resources

let successfulEmails = 0;
let requestCount = 0;
let dataIndex = 0;

const _send = async (user, to, from, subject, htmlContent) => {
    const jwtClient = new google.auth.JWT(
        privateKey.client_email,
        null,
        privateKey.private_key,
        ['https://mail.google.com/'],
        user
    );

    const tokens = await jwtClient.authorize();
    if (!tokens) {
        console.log('Failed to authorize');
        return;
    }

    const raw = Buffer.from(
        `Content-Type: text/html; charset="UTF-8"\n` +
        `From: ${from} <${user}>\n` +
        `To: ${to}\n` +
        `Subject: ${subject}\n\n` +
        htmlContent,
        'utf-8'
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

    const url = 'https://www.googleapis.com/gmail/v1/users/me/messages/send';
    const headers = {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json'
    };
    const data = {
        raw: raw
    };

    try {
        await axios.post(url, data, { headers: headers });
        await console.log(`message send ${successfulEmails}`)
        successfulEmails++;
    } catch (error) {
        console.error('Failed to send email:', error);
    }
};

const readCsv = async (filePath) => {
    const items = [];
    await new Promise(resolve => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                items.push(row);
            })
            .on('end', () => {
                console.log(`${filePath} successfully processed, ${items.length} items`);
                resolve(items);
            });
    });
    return items;
};

const sendEmailBatch = async (users, data, info, htmlContent) => {
    const { from, subject } = info[0];
    const emailTasks = [];

    for (let user of users) {
        const emailTask = Promise.all(Array.from({ length: REQUESTS_PER_EMAIL }, async () => {
            if (dataIndex >= data.length) {
                return;
            }

            const startTime = Date.now();
            await _send(user.email, data[dataIndex].to, from, subject, htmlContent);
            const elapsedTime = Date.now() - startTime;

            requestCount++;
            const delay = INTERVAL * requestCount - elapsedTime;
            if (delay > 0) {
                await sleep(delay);
            }

            dataIndex++;
        }));
        emailTasks.push(emailTask);
    }

    await Promise.all(emailTasks);
};

const sendEmails = async () => {
    const users = await readCsv('files/users.csv');
    const data = await readCsv('files/data.csv');
    const info = await readCsv('files/info.csv');
    const htmlContent = fs.readFileSync('files/html.txt', 'utf8').trim();

    // Split users into batches for concurrent processing
    for (let i = 0; i < users.length; i += CONCURRENT_USERS) {
        const batchUsers = users.slice(i, i + CONCURRENT_USERS);
        await sendEmailBatch(batchUsers, data, info, htmlContent);
    }

    console.log('All emails sent successfully.', successfulEmails);
};

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

sendEmails().catch(console.error);
